"""Emailed 6-digit login codes — the PWA-friendly twin of the magic link.

Installed PWAs have their own cookie jar; the emailed LINK opens in the
browser, so its session never reaches the app. The CODE is typed into
whatever context requested it. Stored hashed in the default (Redis) cache,
same TTL as the link, 5 attempts, single-use.
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


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def issue(tenant_schema: str, email: str) -> str | None:
    """Generate, store (hashed), and return a fresh code — or None if the
    cache is unavailable (link login must never depend on the code)."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        cache.set(
            _key(tenant_schema, email),
            {"hash": _hash(code), "attempts": 0},
            timeout=settings.MAGIC_LINK_EXPIRY_MINUTES * 60,
        )
    except Exception:
        logger.exception("login code store failed; email will carry link only")
        return None
    return code


def check(tenant_schema: str, email: str, code: str) -> bool:
    """True consumes the code. Any failure path is indistinguishable to the
    caller; the 5th wrong attempt deletes the key."""
    key = _key(tenant_schema, email)
    try:
        entry = cache.get(key)
    except Exception:
        logger.exception("login code cache read failed")
        return False
    if not entry:
        return False
    if secrets.compare_digest(entry["hash"], _hash(code)):
        cache.delete(key)
        return True
    entry["attempts"] = entry.get("attempts", 0) + 1
    if entry["attempts"] >= MAX_ATTEMPTS:
        cache.delete(key)
    else:
        cache.set(key, entry, timeout=settings.MAGIC_LINK_EXPIRY_MINUTES * 60)
    return False
