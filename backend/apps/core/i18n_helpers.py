"""Lightweight message localization for user-facing API errors.

This is a deliberately thin alternative to Django's full gettext/.po
workflow for the limited set of API responses our frontends surface to
end users. If the message catalog outgrows ~50 entries, migrate to .po.

English only. The {locale: string} shape stays so a language can be added back.
"""

from typing import Any

# Key → {locale: string}. Keep keys short and stable.
_MESSAGES: dict[str, dict[str, str]] = {
    "brand_taken": {
        "en": "Brand name already taken",
    },
    "brand_required": {
        "en": "Brand name is required",
    },
    "verification_sent": {
        "en": "Verification email sent. Check your inbox.",
    },
    "token_required": {
        "en": "Token required",
    },
    "token_invalid_or_expired": {
        "en": "Invalid or expired token",
    },
    "slug_required": {
        "en": "slug parameter required",
    },
    "tenant_not_found": {
        "en": "Tenant not found",
    },
    "magic_link_sent": {
        "en": "If an account exists, a magic link has been sent.",
    },
    "token_wrong_tenant": {
        "en": "Token not valid for this tenant",
    },
    "logged_out": {
        "en": "Logged out",
    },
    "unsupported_locale": {
        "en": "Unsupported locale",
    },
    "permission_denied": {
        "en": "Permission denied.",
    },
    "student_not_found": {
        "en": "Student not found.",
    },
}


def msg(request: Any, key: str) -> str:
    entry = _MESSAGES.get(key)
    if not entry:
        return key  # surface the key itself if we forgot to add it; never crash
    return entry["en"]
