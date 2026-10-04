"""Minimal RFC 6238 TOTP implementation (no third-party dependency)."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

DIGITS = 6
PERIOD = 30


def generate_secret(length: int = 20) -> str:
    """Base32 secret (no padding), as expected by authenticator apps."""
    raw = secrets.token_bytes(length)
    return base64.b32encode(raw).decode().rstrip("=")


def _hotp(secret: str, counter: int) -> str:
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % (10**DIGITS)).zfill(DIGITS)


def totp_at(secret: str, timestamp: float | None = None, period: int = PERIOD) -> str:
    counter = int((timestamp if timestamp is not None else time.time()) // period)
    return _hotp(secret, counter)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    """Accept the current code plus `window` steps either side (clock drift)."""
    if not code or not secret:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit():
        return False
    now = int(time.time() // PERIOD)
    for drift in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret, now + drift), code.zfill(DIGITS)):
            return True
    return False


def provisioning_uri(secret: str, email: str, issuer: str = "FinTrack") -> str:
    label = quote(f"{issuer}:{email}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"
    )