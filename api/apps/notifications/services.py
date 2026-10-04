"""Creates notifications for budgets, debts, goals and generated transactions."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.finance.models import Budget, Debt, SavingsGoal
from apps.finance.services import budget_progress, in_base_currency

from .models import Notification


def push(user, *, kind: str, title: str, body: str = "", entity: str = "",
         entity_id: str = "", level: str = "info") -> Notification | None:
    """Deduplicated by (kind, entity_id, title) within a rolling day."""
    if entity_id and Notification.objects.filter(
        user=user, kind=kind, entity_id=entity_id, title=title,
        created_at__gte=timezone.now() - timedelta(days=1),
    ).exists():
        return None
    return Notification.objects.create(
        user=user, kind=kind, title=title, body=body, entity=entity,
        entity_id=entity_id, level=level,
    )


def check_budgets() -> int:
    created = 0
    for budget in Budget.objects.filter(deleted_at__isnull=True).select_related("user", "category"):
        progress = budget_progress(budget)
        if not progress["over_threshold"]:
            continue
        category = budget.category.name if budget.category else "Uncategorised"
        percent = progress["percent"]
        if percent >= 100:
            title = f"Budget exceeded: {category}"
            level = "critical"
        else:
            title = f"Budget at {percent}%: {category}"
            level = "warning"
        if push(
            budget.user,
            kind="budget",
            title=title,
            body=f"{progress['spent']} of {progress['amount']} spent this {budget.period}.",
            entity="budget",
            entity_id=str(budget.id),
            level=level,
        ):
            created += 1
    return created


def check_debt_due(days: int = 7) -> int:
    horizon = (timezone.now() + timedelta(days=days)).date()
    created = 0
    for debt in Debt.objects.filter(
        deleted_at__isnull=True, due_date__isnull=False, due_date__lte=horizon
    ).select_related("user"):
        if debt.due_date is None:
            continue
        days_left = (debt.due_date - timezone.localdate()).days
        when = "today" if days_left == 0 else f"in {days_left} day(s)"
        if push(
            debt.user,
            kind="debt",
            title=f"Debt due {when}: {debt.counterparty}",
            body=f"{debt.remaining_amount} {debt.currency} outstanding.",
            entity="debt",
            entity_id=str(debt.id),
            level="warning" if days_left <= 3 else "info",
        ):
            created += 1
    return created


def check_goals() -> int:
    created = 0
    for goal in SavingsGoal.objects.filter(deleted_at__isnull=True).select_related(
        "user", "linked_account"
    ):
        if not goal.linked_account:
            continue
        target = in_base_currency(goal.user, goal.target_amount, goal.currency)
        current = in_base_currency(
            goal.user, goal.linked_account.current_balance, goal.linked_account.currency
        )
        if target and current >= target > Decimal("0"):
            if push(
                goal.user,
                kind="goal",
                title=f"Goal reached: {goal.name}",
                body=f"Linked account reached {goal.target_amount} {goal.currency}.",
                entity="savings_goal",
                entity_id=str(goal.id),
                level="info",
            ):
                created += 1
    return created