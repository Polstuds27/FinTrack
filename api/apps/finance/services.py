"""Domain services: balances, recurring generation, installments, FX, reports."""

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .models import (
    Account,
    Budget,
    Category,
    Debt,
    ExchangeRate,
    InstallmentPlan,
    RecurringRule,
    SavingsGoal,
    Transaction,
)

MONTHS = 12


# --------------------------------------------------------------------------- balances
def recompute_account_balance(account: Account) -> Decimal:
    """Recompute cached current_balance from the transaction ledger."""
    balance = account.opening_balance
    txs = Transaction.objects.filter(
        Q(from_account=account) | Q(to_account=account), deleted_at__isnull=True
    )
    for tx in txs:
        if tx.type == "income":
            target = tx.to_account or tx.from_account
            if target and target.id == account.id:
                balance += tx.amount
        elif tx.type == "expense":
            target = tx.from_account or tx.to_account
            if target and target.id == account.id:
                balance -= tx.amount
        else:  # transfer
            if tx.from_account and tx.from_account_id == account.id:
                balance -= tx.amount
            if tx.to_account and tx.to_account_id == account.id:
                balance += tx.amount
    account.current_balance = balance
    account.save(update_fields=["current_balance", "updated_at"])
    return balance


def refresh_accounts(tx: Transaction) -> None:
    ids = set()
    if tx.from_account_id:
        ids.add(tx.from_account_id)
    if tx.to_account_id:
        ids.add(tx.to_account_id)
    for acc in Account.objects.filter(id__in=ids):
        recompute_account_balance(acc)


def refresh_account_balance(account: Account) -> None:
    recompute_account_balance(account)


# ------------------------------------------------------------------- date utilities
def add_months(value: date, months: int) -> date:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def period_bounds(period: str, as_of: date) -> tuple[date, date]:
    if period == "weekly":
        start = as_of - timedelta(days=as_of.weekday())
        return start, start + timedelta(days=6)
    if period == "yearly":
        return date(as_of.year, 1, 1), date(as_of.year, 12, 31)
    start = date(as_of.year, as_of.month, 1)
    last = calendar.monthrange(as_of.year, as_of.month)[1]
    return start, date(as_of.year, as_of.month, last)


def period_start_for(period: str, as_of: date) -> date:
    return period_bounds(period, as_of)[0]


def _local_datetime(value: date) -> datetime:
    """Midnight on `value` in the configured timezone, as an aware datetime."""
    return timezone.make_aware(datetime(value.year, value.month, value.day))


# --------------------------------------------------------------------------- FX
def _rate(user, base: str, quote: str) -> Decimal:
    if base == quote:
        return Decimal("1")
    direct = (
        ExchangeRate.objects.filter(user=user, base_currency=base, quote_currency=quote)
        .order_by("-date")
        .first()
    )
    if direct:
        return direct.rate
    inverse = (
        ExchangeRate.objects.filter(user=user, base_currency=quote, quote_currency=base)
        .order_by("-date")
        .first()
    )
    if inverse and inverse.rate:
        return Decimal("1") / inverse.rate
    return Decimal("1")


def convert(user, amount: Decimal, base: str, quote: str) -> Decimal:
    if base == quote:
        return amount
    return (amount * _rate(user, base, quote)).quantize(Decimal("0.01"))


def base_currency(user) -> str:
    return getattr(user, "preferred_currency", None) or "USD"


def in_base_currency(user, amount: Decimal, currency: str) -> Decimal:
    return convert(user, amount, currency, base_currency(user))


# --------------------------------------------------------------------- recurring
def next_occurrence(rule: RecurringRule, from_dt):
    """Next occurrence, preserving the original time-of-day."""
    if rule.frequency == "daily":
        return from_dt + timedelta(days=1)
    if rule.frequency == "weekly":
        return from_dt + timedelta(weeks=1)
    months = 12 if rule.frequency == "yearly" else 1
    nxt = add_months(from_dt.date(), months)
    return from_dt.replace(year=nxt.year, month=nxt.month, day=nxt.day)


def run_due_recurring(now=None) -> int:
    """Materialize every enabled rule whose next_run_at is due. Idempotent."""
    now = now or timezone.now()
    created = 0
    rules = RecurringRule.objects.filter(
        enabled=True, deleted_at__isnull=True, next_run_at__lte=now
    ).select_related("from_account", "to_account", "category")
    for rule in rules:
        if rule.end_at and rule.end_at < now:
            rule.enabled = False
            rule.save(update_fields=["enabled", "updated_at"])
            continue
        due = rule.next_run_at
        guard = 0
        while due <= now and guard < 36:
            tx = Transaction(
                user_id=rule.user_id,
                type=rule.type,
                amount=rule.amount,
                currency=rule.currency,
                fx_rate=1,
                from_account=rule.from_account,
                to_account=rule.to_account,
                category=rule.category,
                date=due,
                notes=rule.notes or f"Recurring ({rule.get_frequency_display()})",
                recurring=rule,
            )
            tx.full_clean(exclude=["user", "tags"])
            tx.save()
            refresh_accounts(tx)
            created += 1
            due = next_occurrence(rule, due)
            guard += 1
        rule.last_run_at = due
        rule.next_run_at = due
        rule.save(update_fields=["last_run_at", "next_run_at", "updated_at"])
    return created


# ------------------------------------------------------------------ installments
def _installment_step(frequency: str):
    if frequency == "weekly":
        return lambda d: d + timedelta(weeks=1)
    if frequency == "quarterly":
        return lambda d: add_months(d, 3)
    return lambda d: add_months(d, 1)


def generate_installments(plan: InstallmentPlan, regenerate: bool = False) -> int:
    """Create one transaction per installment. Safe to call again (no duplicates)."""
    if plan.generated_at and not regenerate:
        return 0
    step = _installment_step(plan.frequency)
    # Whole cents first, remainder folded into the final installment.
    total_cents = int((plan.total_amount * 100).to_integral_value())
    step_cents = total_cents // plan.parts_count
    remainder = total_cents - step_cents * plan.parts_count
    due = plan.start_date
    created = 0
    for index in range(plan.parts_count):
        cents = step_cents + (remainder if index == plan.parts_count - 1 else 0)
        share = (Decimal(cents) / 100).quantize(Decimal("0.01"))
        tx = Transaction(
            user_id=plan.user_id,
            type="expense",
            amount=share,
            currency=plan.currency,
            fx_rate=1,
            from_account=plan.from_account,
            to_account=None,
            category=plan.category,
            date=_local_datetime(due),
            notes=plan.notes or f"Installment {index + 1}/{plan.parts_count}",
            installment=plan,
        )
        tx.full_clean(exclude=["user", "tags"])
        tx.save()
        refresh_accounts(tx)
        created += 1
        due = step(due)
    plan.generated_at = timezone.now()
    plan.save(update_fields=["generated_at", "updated_at"])
    return created


# ------------------------------------------------------------------------ budgets
def budget_progress(budget: Budget, as_of: date | None = None) -> dict:
    as_of = as_of or timezone.localdate()
    start, end = period_bounds(budget.period, as_of)
    if budget.start_date > start:
        start = budget.start_date
    spent_qs = Transaction.objects.filter(
        user_id=budget.user_id,
        deleted_at__isnull=True,
        type="expense",
        date__date__gte=start,
        date__date__lte=end,
    )
    if budget.category_id:
        spent_qs = spent_qs.filter(category_id=budget.category_id)
    spent = (spent_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")).quantize(
        Decimal("0.01")
    )
    amount = budget.amount or Decimal("0")
    percent = float((spent / amount) * 100) if amount else 0.0
    return {
        "budget_id": str(budget.id),
        "category_id": str(budget.category_id) if budget.category_id else None,
        "period": budget.period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "amount": str(amount),
        "spent": str(spent),
        "remaining": str((amount - spent).quantize(Decimal("0.01"))),
        "percent": round(percent, 1),
        "alert_threshold": budget.alert_threshold,
        "over_threshold": percent >= budget.alert_threshold,
    }


# ------------------------------------------------------------------------ reports
def _tx_queryset(user, start: date | None = None, end: date | None = None):
    qs = Transaction.objects.filter(user=user, deleted_at__isnull=True)
    if start:
        qs = qs.filter(date__date__gte=start)
    if end:
        qs = qs.filter(date__date__lte=end)
    return qs


def summary(user, as_of: date | None = None) -> dict:
    as_of = as_of or timezone.localdate()
    base = base_currency(user)
    accounts = list(Account.objects.filter(user=user, deleted_at__isnull=True, archived=False))
    month_start, month_end = period_bounds("monthly", as_of)

    month_txs = list(_tx_queryset(user, month_start, month_end).select_related("category"))
    income = Decimal("0")
    expense = Decimal("0")
    by_category: dict[str, dict] = defaultdict(
        lambda: {"income": Decimal("0"), "expense": Decimal("0"), "count": 0}
    )
    for tx in month_txs:
        value = in_base_currency(user, tx.amount, tx.currency)
        if tx.type == "income":
            income += value
        elif tx.type == "expense":
            expense += value
        else:
            continue
        key = str(tx.category_id) if tx.category_id else "uncategorised"
        entry = by_category[key]
        entry["count"] += 1
        if tx.type == "income":
            entry["income"] += value
        else:
            entry["expense"] += value

    monthly = monthly_series(user, months=6, as_of=as_of)

    debts = list(Debt.objects.filter(user=user, deleted_at__isnull=True))
    goals = list(SavingsGoal.objects.filter(user=user, deleted_at__isnull=True))

    return {
        "as_of": as_of.isoformat(),
        "base_currency": base,
        "net_worth": str(
            sum(
                (in_base_currency(user, a.current_balance, a.currency) for a in accounts),
                Decimal("0"),
            ).quantize(Decimal("0.01"))
        ),
        "accounts": [
            {
                "id": str(a.id),
                "name": a.name,
                "type": a.type,
                "currency": a.currency,
                "balance": str(a.current_balance),
                "balance_in_base": str(
                    in_base_currency(user, a.current_balance, a.currency)
                ),
                "credit_limit": str(a.credit_limit) if a.credit_limit is not None else None,
            }
            for a in accounts
        ],
        "month": {
            "start": month_start.isoformat(),
            "end": month_end.isoformat(),
            "income": str(income.quantize(Decimal("0.01"))),
            "expense": str(expense.quantize(Decimal("0.01"))),
            "net": str((income - expense).quantize(Decimal("0.01"))),
            "transaction_count": len(month_txs),
        },
        "monthly": monthly,
        "by_category": _category_breakdown(user, by_category, base),
        "budgets": [
            budget_progress(b)
            for b in Budget.objects.filter(user=user, deleted_at__isnull=True).select_related(
                "category"
            )
        ],
        "debts": {
            "owed_to_me": str(
                sum((in_base_currency(user, d.remaining_amount, d.currency)
                     for d in debts if d.direction == "owed_to_me"), Decimal("0"))
            ),
            "i_owe": str(
                sum((in_base_currency(user, d.remaining_amount, d.currency)
                     for d in debts if d.direction == "i_owe"), Decimal("0"))
            ),
            "count": len(debts),
        },
        "goals": [
            {
                "id": str(g.id),
                "name": g.name,
                "target_amount": str(g.target_amount),
                "currency": g.currency,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "progress": str(g.linked_account.current_balance) if g.linked_account else None,
            }
            for g in goals
        ],
        "upcoming": upcoming(user, days=14),
    }


def _category_breakdown(user, by_category: dict, base: str) -> list[dict]:
    names = {
        str(c.id): c.name
        for c in Category.objects.filter(user=user, deleted_at__isnull=True)
    }
    rows = []
    for key, entry in by_category.items():
        rows.append(
            {
                "category_id": None if key == "uncategorised" else key,
                "name": names.get(key, "Uncategorised"),
                "income": str(entry["income"]),
                "expense": str(entry["expense"]),
                "count": entry["count"],
            }
        )
    rows.sort(key=lambda row: float(row["expense"]), reverse=True)
    return rows


def monthly_series(user, months: int = MONTHS, as_of: date | None = None) -> list[dict]:
    as_of = as_of or timezone.localdate()
    first = add_months(as_of.replace(day=1), -(months - 1))
    buckets: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"income": Decimal("0"), "expense": Decimal("0")}
    )
    qs = _tx_queryset(user, first, as_of).exclude(type="transfer")
    for tx in qs.only("type", "amount", "currency", "date"):
        key = f"{tx.date.year:04d}-{tx.date.month:02d}"
        value = in_base_currency(user, tx.amount, tx.currency)
        buckets[key]["income" if tx.type == "income" else "expense"] += value
    series = []
    for offset in range(months):
        month = add_months(first, offset)
        key = f"{month.year:04d}-{month.month:02d}"
        income = buckets[key]["income"].quantize(Decimal("0.01"))
        expense = buckets[key]["expense"].quantize(Decimal("0.01"))
        series.append(
            {
                "month": key,
                "income": str(income),
                "expense": str(expense),
                "net": str((income - expense).quantize(Decimal("0.01"))),
            }
        )
    return series


def upcoming(user, days: int = 14) -> list[dict]:
    now = timezone.now()
    horizon = now + timedelta(days=days)
    rows: list[dict] = []
    for rule in RecurringRule.objects.filter(
        user=user, enabled=True, deleted_at__isnull=True, next_run_at__lte=horizon
    ).select_related("from_account", "to_account", "category"):
        account = rule.from_account or rule.to_account
        rows.append(
            {
                "kind": "recurring",
                "id": str(rule.id),
                "type": rule.type,
                "amount": str(rule.amount),
                "currency": rule.currency,
                "date": rule.next_run_at.date().isoformat(),
                "label": rule.notes or rule.get_frequency_display(),
                "account": account.name if account else None,
                "category": rule.category.name if rule.category else None,
            }
        )
    for debt in Debt.objects.filter(
        user=user, deleted_at__isnull=True, due_date__lte=horizon.date()
    ):
        if debt.due_date is None:
            continue
        rows.append(
            {
                "kind": "debt",
                "id": str(debt.id),
                "type": debt.direction,
                "amount": str(debt.remaining_amount),
                "currency": debt.currency,
                "date": debt.due_date.isoformat(),
                "label": debt.counterparty,
                "account": None,
                "category": None,
            }
        )
    rows.sort(key=lambda row: str(row["date"]))
    return rows


def net_worth_series(user, months: int = MONTHS, as_of: date | None = None) -> list[dict]:
    """Running net worth at the end of each month, derived from the ledger."""
    as_of = as_of or timezone.localdate()
    accounts = list(Account.objects.filter(user=user, deleted_at__isnull=True))
    first = add_months(as_of.replace(day=1), -(months - 1))
    balances: dict[str, Decimal] = {str(a.id): a.opening_balance for a in accounts}
    currencies = {str(a.id): a.currency for a in accounts}
    flows = defaultdict(list)
    for tx in Transaction.objects.filter(
        user=user, deleted_at__isnull=True, date__date__gte=first, date__date__lte=as_of
    ).only("type", "amount", "currency", "date", "from_account_id", "to_account_id"):
        flows[f"{tx.date.year:04d}-{tx.date.month:02d}"].append(tx)

    series = []
    zero = Decimal("0")

    def apply(account_id, delta):
        key = str(account_id)
        balances[key] = balances.get(key, zero) + delta

    for offset in range(months):
        month = add_months(first, offset)
        key = f"{month.year:04d}-{month.month:02d}"
        for tx in flows.get(key, []):
            if tx.type == "transfer":
                if tx.from_account_id:
                    apply(tx.from_account_id, -tx.amount)
                if tx.to_account_id:
                    apply(tx.to_account_id, tx.amount)
                continue
            sign = tx.amount if tx.type == "income" else -tx.amount
            target = tx.to_account_id if tx.type == "income" else tx.from_account_id
            target = target or (tx.from_account_id if tx.type == "income" else tx.to_account_id)
            if target:
                apply(target, sign)
        total = sum(
            (
                in_base_currency(user, value, currencies.get(account_id, "USD"))
                for account_id, value in balances.items()
            ),
            Decimal("0"),
        )
        series.append({"month": key, "net_worth": str(total.quantize(Decimal("0.01")))})
    return series