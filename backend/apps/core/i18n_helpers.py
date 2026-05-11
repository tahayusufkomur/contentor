"""Lightweight message localization for user-facing API errors.

This is a deliberately thin alternative to Django's full gettext/.po
workflow for the limited set of API responses our frontends surface to
end users. If the message catalog outgrows ~50 entries, migrate to .po.

Resolution order:
  1. request.region == "tr" → TR
  2. Accept-Language header starts with "tr" → TR
  3. otherwise → EN

TR: needs native review.
"""

from typing import Any

# Key → {locale: string}. Keep keys short and stable.
_MESSAGES: dict[str, dict[str, str]] = {
    "brand_taken": {
        "en": "Brand name already taken",
        "tr": "Marka adı zaten alınmış",
    },
    "verification_sent": {
        "en": "Verification email sent. Check your inbox.",
        "tr": "Doğrulama e-postası gönderildi. Gelen kutunuzu kontrol edin.",
    },
    "token_required": {
        "en": "Token required",
        "tr": "Doğrulama kodu gerekli",
    },
    "token_invalid_or_expired": {
        "en": "Invalid or expired token",
        "tr": "Geçersiz veya süresi dolmuş bağlantı",
    },
    "slug_required": {
        "en": "slug parameter required",
        "tr": "slug parametresi gerekli",
    },
    "tenant_not_found": {
        "en": "Tenant not found",
        "tr": "Kiracı bulunamadı",
    },
    "magic_link_sent": {
        "en": "If an account exists, a magic link has been sent.",
        "tr": "Hesap mevcutsa, sihirli bir bağlantı gönderildi.",
    },
    "token_wrong_tenant": {
        "en": "Token not valid for this tenant",
        "tr": "Bu kiracı için bağlantı geçerli değil",
    },
    "logged_out": {
        "en": "Logged out",
        "tr": "Çıkış yapıldı",
    },
    "unsupported_locale": {
        "en": "Unsupported locale",
        "tr": "Desteklenmeyen dil",
    },
    "permission_denied": {
        "en": "Permission denied.",
        "tr": "İzin reddedildi.",
    },
    "student_not_found": {
        "en": "Student not found.",
        "tr": "Öğrenci bulunamadı.",
    },
}


def resolve_locale(request: Any) -> str:
    region = getattr(request, "region", None)
    if region == "tr":
        return "tr"
    accept = (getattr(request, "META", {}) or {}).get("HTTP_ACCEPT_LANGUAGE", "")
    if accept.lower().startswith("tr"):
        return "tr"
    return "en"


def msg(request: Any, key: str) -> str:
    locale = resolve_locale(request)
    entry = _MESSAGES.get(key)
    if not entry:
        return key  # surface the key itself if we forgot to add it; never crash
    return entry.get(locale) or entry["en"]
