"""Emailed 6-digit login codes — the PWA-friendly twin of the magic link.

Installed PWAs have their own cookie jar; the emailed LINK opens in the
browser, so its session never reaches the app. The CODE is typed into
whatever context requested it. Stored hashed in the default (Redis) cache,
same TTL as the link, 5 attempts, single-use.

Attempt counting uses a separate atomic Redis counter key so parallel wrong
guesses cannot race past the 5-attempt lockout.  The code key is immutable
after issue; only the counter changes on failure.
"""
import hashlib
import logging
import secrets

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5


def _key(tenant_schema: str, email: str) -> str:
    return f"login_code:{tenant_schema}:{email.lower()}"


def _attempts_key(tenant_schema: str, email: str) -> str:
    return f"login_code_attempts:{tenant_schema}:{email.lower()}"


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def issue(tenant_schema: str, email: str) -> str | None:
    """Generate, store (hashed), and return a fresh code — or None if the
    cache is unavailable (link login must never depend on the code)."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = settings.MAGIC_LINK_EXPIRY_MINUTES * 60
    try:
        cache.set(
            _key(tenant_schema, email),
            {"hash": _hash(code)},
            timeout=ttl,
        )
        cache.set(
            _attempts_key(tenant_schema, email),
            0,
            timeout=ttl,
        )
    except Exception:
        logger.exception("login code store failed; email will carry link only")
        return None
    return code


def check(tenant_schema: str, email: str, code: str) -> bool:
    """True consumes the code. Any failure path is indistinguishable to the
    caller; the 5th wrong attempt deletes both keys."""
    key = _key(tenant_schema, email)
    attempts_key = _attempts_key(tenant_schema, email)
    try:
        entry = cache.get(key)
    except Exception:
        logger.exception("login code cache read failed")
        return False
    if not entry:
        return False
    if secrets.compare_digest(entry["hash"], _hash(code)):
        try:
            cache.delete(key)
            cache.delete(attempts_key)
        except Exception:
            logger.exception("login code cache delete failed after correct code")
        return True
    # Wrong code — atomically increment the counter (safe under parallel requests).
    try:
        attempts = cache.incr(attempts_key)
    except Exception:
        # Key missing/expired or Redis blip — treat as invalid rather than 500.
        logger.exception("login code attempts counter unavailable")
        return False
    if attempts >= MAX_ATTEMPTS:
        try:
            cache.delete(key)
            cache.delete(attempts_key)
        except Exception:
            logger.exception("login code cache delete failed after max attempts")
    return False
