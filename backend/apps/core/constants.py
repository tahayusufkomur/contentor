"""Region and locale constants for the Contentor platform.

Region is the primary axis of isolation. A tenant is created in one region
and stays there forever. Locale is a downstream preference within a region.
"""

REGION_GLOBAL = "global"
REGION_CHOICES = [(REGION_GLOBAL, "Global")]

LOCALE_EN = "en"
LOCALE_CHOICES = [(LOCALE_EN, "English")]

CURRENCY_USD = "USD"
CURRENCY_EUR = "EUR"
CURRENCY_CHOICES = [
    (CURRENCY_USD, "US Dollar"),
    (CURRENCY_EUR, "Euro"),
]

REGION_DEFAULT_LOCALE = {REGION_GLOBAL: LOCALE_EN}

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
}
