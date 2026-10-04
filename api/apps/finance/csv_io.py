"""CSV import/export for transactions (Money Manager friendly column names)."""

import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from .models import Account, Category, Transaction
from .services import refresh_accounts

EXPORT_FIELDS = [
    "type",
    "amount",
    "currency",
    "date",
    "from_account",
    "to_account",
    "category",
    "notes",
    "is_bookmarked",
]

TYPE_ALIASES = {
    "income": "income",
    "in": "income",
    "credit": "income",
    "expense": "expense",
    "out": "expense",
    "debit": "expense",
    "transfer": "transfer",
    "move": "transfer",
}

DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y")


def parse_date(value: str):
    value = (value or "").strip()
    if not value:
        return timezone.now()
    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(value, fmt)
        except ValueError:
            continue
        return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
    raise ValueError(f"Unsupported date format: {value!r}")


def parse_decimal(value: str) -> Decimal:
    raw = (value or "").strip().replace(",", "")
    if not raw:
        raise ValueError("Missing amount")
    try:
        return Decimal(raw).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount: {value!r}") from exc


def parse_bool(value: str) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "y"}


class CsvExportError(Exception):
    pass


def export_transactions(user, queryset=None) -> str:
    qs = queryset if queryset is not None else Transaction.objects.filter(
        user=user, deleted_at__isnull=True
    )
    names = {
        str(a.id): a.name for a in Account.objects.filter(user=user, deleted_at__isnull=True)
    }
    cats = {
        str(c.id): c.name
        for c in Category.objects.filter(user=user, deleted_at__isnull=True)
    }
    buffer: list[str] = []
    writer = csv.writer(_Sink(buffer))
    writer.writerow(EXPORT_FIELDS)
    for tx in qs.order_by("date"):
        writer.writerow(
            [
                tx.type,
                f"{tx.amount:.2f}",
                tx.currency,
                timezone.localtime(tx.date).strftime("%Y-%m-%d %H:%M:%S"),
                names.get(str(tx.from_account_id), ""),
                names.get(str(tx.to_account_id), ""),
                cats.get(str(tx.category_id), ""),
                tx.notes,
                "1" if tx.is_bookmarked else "",
            ]
        )
    return "".join(buffer)


class _Sink:
    """Minimal file-like object so csv can write into a list of strings."""

    def __init__(self, buffer):
        self.buffer = buffer

    def write(self, value):
        self.buffer.append(value)
        return len(value)


class ImportResult:
    def __init__(self) -> None:
        self.created = 0
        self.skipped = 0
        self.errors: list[dict[str, object]] = []

    def as_dict(self) -> dict[str, object]:
        return {"created": self.created, "skipped": self.skipped, "errors": self.errors}


def import_transactions(user, csv_text: str, dry_run: bool = False) -> ImportResult:
    result = ImportResult()
    accounts = {
        a.name.lower(): a
        for a in Account.objects.filter(user=user, deleted_at__isnull=True)
    }
    categories = {
        (c.name.lower(), c.type): c
        for c in Category.objects.filter(user=user, deleted_at__isnull=True)
    }

    reader = csv.DictReader(csv_text.splitlines())
    if not reader.fieldnames or "amount" not in [f.strip().lower() for f in reader.fieldnames]:
        result.errors.append({"row": 0, "error": "CSV must contain an 'amount' column"})
        return result

    for index, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        try:
            tx_type = TYPE_ALIASES.get(row.get("type", "expense").lower())
            if tx_type is None:
                raise ValueError(f"Unknown transaction type: {row.get('type')!r}")
            amount = parse_decimal(row.get("amount", ""))
            when = parse_date(row.get("date", ""))
            from_account = accounts.get(row.get("from_account", "").lower())
            to_account = accounts.get(row.get("to_account", "").lower())
            category = categories.get(
                (row.get("category", "").lower(), "income" if tx_type == "income" else "expense")
            )
            if tx_type == "transfer":
                if not from_account or not to_account:
                    raise ValueError("Transfers need existing 'from' and 'to' accounts")
            elif not (from_account or to_account):
                raise ValueError("Income/expense rows need an existing account")
        except ValueError as exc:
            result.skipped += 1
            result.errors.append({"row": index, "error": str(exc)})
            continue

        if dry_run:
            result.created += 1
            continue

        tx = Transaction(
            user=user,
            type=tx_type,
            amount=amount,
            currency=(row.get("currency") or "USD").upper()[:3],
            date=when,
            from_account=from_account,
            to_account=None if tx_type == "expense" else to_account,
            category=category,
            notes=row.get("notes", ""),
            is_bookmarked=parse_bool(row.get("is_bookmarked", "")),
        )
        tx.full_clean(exclude=["user", "tags"])
        tx.save()
        refresh_accounts(tx)
        result.created += 1

    return result