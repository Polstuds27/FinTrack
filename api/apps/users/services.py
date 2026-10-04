"""Hard-delete everything belonging to a user.

Account deletion has to bypass the PROTECT guards on `Transaction.from_account` /
`to_account`, which exist to stop an *account* from being deleted out from under
its transactions. Explicit ordering is used instead of flipping those guards to
CASCADE, so ordinary account deletion stays protected.
"""

from django.db import transaction as db_transaction

from apps.attachments.models import Attachment
from apps.attachments.services import destroy as destroy_remote_file
from apps.audit.models import AuditLog
from apps.finance.models import (
    Account,
    AccountGroup,
    Budget,
    Category,
    Debt,
    ExchangeRate,
    InstallmentPlan,
    RecurringRule,
    SavingsGoal,
    Tag,
    Transaction,
)
from apps.notifications.models import Notification
from apps.sync.models import SyncCheckpoint, SyncEvent, SyncMutation


def _release_cloudinary_files(user) -> None:
    for attachment in Attachment.objects.filter(user=user):
        destroy_remote_file(attachment.public_id)


@db_transaction.atomic
def purge_user(user) -> dict[str, int]:
    """Delete a user and every row that belongs to them. Returns per-model counts."""
    counts: dict[str, int] = {}

    _release_cloudinary_files(user)

    # Order matters: rows that are PROTECTed by others go first.
    counts["attachments"] = Attachment.objects.filter(user=user).delete()[0]
    counts["transactions"] = Transaction.objects.filter(user=user).delete()[0]
    for model in (
        SavingsGoal,
        Debt,
        Budget,
        InstallmentPlan,
        RecurringRule,
        Account,
        AccountGroup,
        Category,
        ExchangeRate,
        Tag,
    ):
        counts[model.__name__] = model.objects.filter(user=user).delete()[0]

    counts["notifications"] = Notification.objects.filter(user=user).delete()[0]
    for sync_model in (SyncMutation, SyncEvent, SyncCheckpoint):
        counts[sync_model.__name__] = sync_model.objects.filter(user=user).delete()[0]
    # Audit rows are SET_NULL on user; drop the ones that point at this user.
    counts["audit_logs"] = AuditLog.objects.filter(user=user).delete()[0]

    counts["user"] = 1
    user.delete()
    return counts