"""Chrome executors behind edit_theme / edit_navbar: narrow TenantConfig
fields (theme id from the catalog, navbar layout/cta).

Pure helpers — validation and merge only, no DB writes (those happen in the
execute view, like blocks.py). Navbar updates are overlaid on the current
navbar_config and cleaned by TenantConfigSerializer.validate_navbar_config,
the exact allowlist the admin config PATCH enforces, so the copilot can
never write a navbar shape the admin couldn't. Imports are function-local
to match apps/core's cycle-dodging convention."""


class ChromeOpError(Exception):
    """User-safe message describing why a chrome edit was refused."""


def clean_theme(theme_id):
    from apps.tenant_config.models import TenantTheme

    theme = str(theme_id or "").strip().lower()
    if theme not in TenantTheme.values:
        raise ChromeOpError("theme must be one of: " + ", ".join(TenantTheme.values))
    return theme


def theme_label(theme_id):
    from apps.tenant_config.models import TenantTheme

    return TenantTheme(theme_id).label


def clean_layout(layout):
    from apps.tenant_config.serializers import _NAVBAR_LAYOUTS

    value = str(layout or "").strip().lower()
    if value not in _NAVBAR_LAYOUTS:
        raise ChromeOpError("layout must be one of: " + ", ".join(sorted(_NAVBAR_LAYOUTS)))
    return value


def merge_navbar(current, updates):
    from rest_framework import serializers as drf_serializers

    from apps.tenant_config.serializers import TenantConfigSerializer

    merged = dict(current or {})
    merged.update(updates)
    known = set(merged)
    try:
        cleaned = TenantConfigSerializer().validate_navbar_config(merged)
    except drf_serializers.ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, list) and detail:
            detail = detail[0]
        raise ChromeOpError(str(detail)) from exc
    # validate_navbar_config materializes defaults for absent keys (e.g.
    # cta=None, show_login=True) as defence-in-depth for the admin PATCH
    # path. The copilot merge must preserve "field was never set" rather
    # than silently writing those defaults in, so drop any key that wasn't
    # present in current/updates before validation.
    return {k: v for k, v in cleaned.items() if k in known}


def clean_links(links):
    from rest_framework import serializers as drf_serializers

    from apps.tenant_config.serializers import TenantConfigSerializer

    if not isinstance(links, list):
        raise ChromeOpError("navbar links must be a list")
    if len(links) > 20:
        raise ChromeOpError("navbar supports up to 20 links")
    try:
        cleaned = TenantConfigSerializer().validate_navbar_config({"links": links})
    except drf_serializers.ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, list) and detail:
            detail = detail[0]
        raise ChromeOpError(str(detail)) from exc
    out = [link for link in cleaned["links"] if link["label"] and link["href"]]
    if not out:
        raise ChromeOpError("every navbar link needs a label and a safe link")
    return out
