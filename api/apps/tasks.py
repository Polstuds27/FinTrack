"""Background jobs (django-q2 ORM broker)."""

from datetime import timedelta

from django.utils import timezone

from .attachments.models import Attachment
from .finance.services import run_due_recurring
from .notifications import services as notification_services
from .sync.models import SyncEvent


def generate_recurring_transactions() -> int:
    """Hourly: materialize due recurring rules into transactions."""
    return run_due_recurring()


def evaluate_alerts() -> dict:
    """Daily: budget thresholds, debt due dates and goal progress."""
    return {
        "budgets": notification_services.check_budgets(),
        "debts": notification_services.check_debt_due(),
        "goals": notification_services.check_goals(),
    }


def prune_sync_events(days: int = 90) -> int:
    """Keep the pull log bounded; clients checkpoint past the horizon anyway."""
    cutoff = timezone.now() - timedelta(days=days)
    return SyncEvent.objects.filter(created_at__lt=cutoff).delete()[0]


def prune_attachments(days: int = 365) -> int:
    """Remove soft-deleted attachment rows a year after deletion."""
    from .attachments.services import destroy

    stale = Attachment.objects.filter(
        deleted_at__isnull=False, deleted_at__lt=timezone.now() - timedelta(days=days)
    )
    count = 0
    for attachment in stale:
        destroy(attachment.public_id)
        attachment.delete()
        count += 1
    return count


def nightly_maintenance() -> dict:
    return {
        "sync_events_deleted": prune_sync_events(),
        "attachments_deleted": prune_attachments(),
    }