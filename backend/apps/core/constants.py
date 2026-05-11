"""Region and locale constants for the Contentor platform.

Region is the primary axis of isolation. A tenant is created in one region
and stays there forever. Locale is a downstream preference within a region.
"""

REGION_GLOBAL = "global"
REGION_TR = "tr"
REGIONS = (REGION_GLOBAL, REGION_TR)
REGION_CHOICES = [
    (REGION_GLOBAL, "Global"),
    (REGION_TR, "Turkey"),
]

LOCALE_EN = "en"
LOCALE_TR = "tr"
LOCALES = (LOCALE_EN, LOCALE_TR)
LOCALE_CHOICES = [
    (LOCALE_EN, "English"),
    (LOCALE_TR, "Türkçe"),
]

CURRENCY_USD = "USD"
CURRENCY_TRY = "TRY"
CURRENCY_CHOICES = [
    (CURRENCY_USD, "US Dollar"),
    (CURRENCY_TRY, "Turkish Lira"),
]

REGION_DEFAULT_LOCALE = {
    REGION_GLOBAL: LOCALE_EN,
    REGION_TR: LOCALE_TR,
}

REGION_DEFAULT_CURRENCY = {
    REGION_GLOBAL: CURRENCY_USD,
    REGION_TR: CURRENCY_TRY,
}

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
}
