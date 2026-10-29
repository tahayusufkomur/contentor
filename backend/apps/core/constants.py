"""Region and locale constants for the Contentor platform.

Region is the primary axis of isolation. A tenant is created in one region
and stays there forever. Locale is a downstream preference within a region.
"""

import json
from pathlib import Path

REGION_GLOBAL = "global"
REGION_CHOICES = [(REGION_GLOBAL, "Global")]

# The list lives in packages/shared/src/i18n/locales.json (synced copy beside this file).
_LOCALES = json.loads((Path(__file__).parent / "i18n" / "locales.json").read_text(encoding="utf-8"))["locales"]

LOCALE_EN = "en"
LOCALE_CHOICES = [(entry["code"], entry["name"]) for entry in _LOCALES]

CURRENCY_USD = "USD"
CURRENCY_EUR = "EUR"
CURRENCY_CHOICES = [
    (CURRENCY_USD, "US Dollar"),
    (CURRENCY_EUR, "Euro"),
]

RESERVED_SLUGS = {
    "tr",
    "www",
    "app",
    "mail",
    "api",
    "admin",
    "static",
    "assets",
    "cdn",
    "help",
    "docs",
    "blog",
    "status",
    "public",
    "rtc",
    "livecraft",
    # Storage written with no tenant in context lands under tenants/unknown/.
    "unknown",
}

# A new site's temporary address until the creator names it in /setup
# (onboarding.site_name). Its schema and storage folder keep it for life.
SITE_PLACEHOLDER_PREFIX = "new-site-"
