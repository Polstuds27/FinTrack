"""Default categories/tags created for every new user."""

from apps.sync.models import SyncEvent

from .models import Category, Tag

DEFAULT_CATEGORIES = [
    ("Salary", "income"),
    ("Freelance", "income"),
    ("Other Income", "income"),
    ("Groceries", "expense"),
    ("Rent", "expense"),
    ("Utilities", "expense"),
    ("Transport", "expense"),
    ("Dining", "expense"),
    ("Health", "expense"),
    ("Entertainment", "expense"),
    ("Shopping", "expense"),
    ("Travel", "expense"),
    ("Education", "expense"),
    ("Subscriptions", "expense"),
    ("Other Expense", "expense"),
]

DEFAULT_TAGS = ["recurring", "reimbursable", "tax-deductible", "shared"]


def seed_defaults(user) -> None:
    """Idempotent: safe to call again for an existing user."""
    categories = [
        Category(user=user, name=name, type=kind, is_custom=False)
        for name, kind in DEFAULT_CATEGORIES
    ]
    Category.objects.bulk_create(categories, ignore_conflicts=True)
    Tag.objects.bulk_create(
        [Tag(user=user, name=name) for name in DEFAULT_TAGS], ignore_conflicts=True
    )
    _record_seeded(user)


def _record_seeded(user) -> None:
    """Put the seeded rows into the change log.

    `POST /sync/pull/` replays recorded history rather than table state, so
    without these events a freshly registered client would sign in with no
    categories at all — they only exist server-side.
    """
    from apps.sync.services import record_event  # local import: sync imports finance

    for entity, rows in (
        ("category", Category.objects.filter(user=user, is_custom=False)),
        ("tag", Tag.objects.filter(user=user)),
    ):
        recorded = set(
            SyncEvent.objects.filter(user=user, entity=entity, op="create").values_list(
                "entity_id", flat=True
            )
        )
        for row in rows:
            if row.id not in recorded:
                record_event(user, entity, row, "create")