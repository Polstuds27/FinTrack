"""MFA backup (recovery) codes: the escape hatch for a lost authenticator.

Codes are random, human-typable, and single-use. Only SHA-256 hashes touch the
database; the plaintext exists solely in the API response at generation time
and is never stored, logged, or emailed.
"""

import hashlib
import secrets

# Crockford-style subset: no 0/O, 1/I/L — nothing to misread off a screen.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_COUNT = 10
GROUP = 5


def generate_recovery_codes(count: int = CODE_COUNT) -> list[str]:
    """Ten `XXXXX-XXXXX` codes. The hyphen is display-only; matching ignores it."""
    codes = set()
    while len(codes) < count:
        raw = "".join(secrets.choice(ALPHABET) for _ in range(GROUP * 2))
        codes.add(f"{raw[:GROUP]}-{raw[GROUP:]}")
    return sorted(codes)


def normalize_recovery_code(value: str | None) -> str:
    """Canonical form for hashing and comparison: upper-cased, no separators."""
    return "".join(ch for ch in (value or "").upper() if ch in ALPHABET)


def looks_like_recovery_code(value: str | None) -> bool:
    return len(normalize_recovery_code(value)) == GROUP * 2


def hash_recovery_code(normalized: str) -> str:
    return hashlib.sha256(normalized.encode()).hexdigest()


def find_unused_code(user, raw: str):
    """The live row matching this code, or None. No timing games needed: the
    endpoint sits behind the auth throttle and hashes are random."""
    from .models import RecoveryCode

    normalized = normalize_recovery_code(raw)
    if len(normalized) != GROUP * 2:
        return None
    return RecoveryCode.objects.filter(
        user=user, code_hash=hash_recovery_code(normalized), used_at__isnull=True
    ).first()


def mint_recovery_codes(user, count: int = CODE_COUNT) -> list[str]:
    """Replace the user's set (regeneration invalidates the old one) and return
    the plaintext exactly once — the caller must show it and then forget it."""
    from .models import RecoveryCode

    RecoveryCode.objects.filter(user=user).delete()
    codes = generate_recovery_codes(count)
    RecoveryCode.objects.bulk_create(
        [
            RecoveryCode(user=user, code_hash=hash_recovery_code(normalize_recovery_code(code)))
            for code in codes
        ]
    )
    return codes


def remaining_recovery_codes(user) -> int:
    from .models import RecoveryCode

    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# ---------------------------------------------------------------------------
# Email OTP challenges (last-resort recovery: no phone, no backup codes).
# ---------------------------------------------------------------------------

EMAIL_CODE_LENGTH = 8
EMAIL_CODE_EXPIRY_MINUTES = 15
EMAIL_CODE_MAX_ATTEMPTS = 5
EMAIL_CODE_COOLDOWN_SECONDS = 60


def _email_code() -> str:
    return "".join(secrets.choice("23456789") for _ in range(EMAIL_CODE_LENGTH))


def looks_like_email_code(value: str | None) -> bool:
    text = (value or "").strip()
    return len(text) == EMAIL_CODE_LENGTH and text.isdigit()


def request_email_challenge(user) -> str | None:
    """Mint a fresh challenge, killing any live one. Returns the plaintext for
    the email, or None during cooldown — callers treat None as silent success
    so response codes never leak whether the account exists."""
    from django.utils import timezone

    from .models import MfaEmailChallenge

    cutoff = timezone.now() - timezone.timedelta(seconds=EMAIL_CODE_COOLDOWN_SECONDS)
    if MfaEmailChallenge.objects.filter(user=user, created_at__gt=cutoff).exists():
        return None
    MfaEmailChallenge.objects.filter(user=user, used_at__isnull=True).delete()
    code = _email_code()
    expires = timezone.now() + timezone.timedelta(minutes=EMAIL_CODE_EXPIRY_MINUTES)
    MfaEmailChallenge.objects.create(
        user=user, code_hash=hash_recovery_code(code), expires_at=expires
    )
    return code


def check_email_challenge(user, raw: str) -> bool:
    """Match check that records misses: a wrong guess burns one of the five
    attempts (deleting the challenge at the cap); a match consumes nothing —
    consumption belongs to the action that succeeds, so validation and failed
    saves never burn a single-use code, while guessing still can't probe."""
    from django.utils import timezone

    from .models import MfaEmailChallenge

    text = (raw or "").strip()
    if not looks_like_email_code(text):
        return False
    challenge = (
        MfaEmailChallenge.objects.filter(user=user, used_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if challenge is None:
        return False
    if timezone.now() > challenge.expires_at or challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS:
        challenge.delete()
        return False
    if not secrets.compare_digest(challenge.code_hash, hash_recovery_code(text)):
        challenge.attempts += 1
        if challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS:
            challenge.delete()
        else:
            challenge.save(update_fields=["attempts"])
        return False
    return True


def verify_email_challenge(user, raw: str) -> bool:
    """One-shot check plus consumption, for single-step flows (login)."""
    from .models import MfaEmailChallenge

    if not check_email_challenge(user, raw):
        return False
    challenge = (
        MfaEmailChallenge.objects.filter(user=user, used_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if challenge is None:  # lost a race with another consumer; stay safe
        return False
    challenge.mark_used()
    return True
