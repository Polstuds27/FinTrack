"""Cloudinary upload helpers.

Configured from CLOUDINARY_URL (or CLOUDINARY_* vars) in settings.
When credentials are missing the API degrades gracefully: uploads are rejected
with a clear message instead of crashing, and the rest of the app keeps working.
"""

import cloudinary
import cloudinary.uploader
from django.conf import settings

_configured = False


def is_configured() -> bool:
    return bool(getattr(settings, "CLOUDINARY_CLOUD_NAME", ""))


def _ensure_config() -> None:
    global _configured
    if not _configured:
        if getattr(settings, "CLOUDINARY_URL", ""):
            cloudinary.config(cloudinary_url=settings.CLOUDINARY_URL)
        else:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True,
            )
        _configured = True


def upload_bytes(data: bytes, public_id: str, content_type: str = "application/octet-stream",
                 folder: str = "fintrack") -> dict:
    _ensure_config()
    result = cloudinary.uploader.upload(
        data,
        public_id=public_id,
        folder=folder,
        resource_type="auto",
        overwrite=False,
    )
    return {
        "url": result.get("secure_url"),
        "public_id": result.get("public_id"),
        "bytes": result.get("bytes", len(data)),
        "format": result.get("format", ""),
        "content_type": result.get("resource_type", content_type),
    }


def destroy(public_id: str) -> None:
    if not public_id or not is_configured():
        return
    _ensure_config()
    try:
        cloudinary.uploader.destroy(public_id)
    except Exception:  # noqa: BLE001 - deletion must never break the request
        pass