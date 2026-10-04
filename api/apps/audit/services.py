from .models import AuditLog


def log_audit(user, action: str, entity: str = "", entity_id: str = "", diff=None, request=None):
    ip = None
    if request is not None:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
    return AuditLog.objects.create(
        user=user, action=action, entity=entity, entity_id=entity_id, diff=diff, ip=ip
    )
