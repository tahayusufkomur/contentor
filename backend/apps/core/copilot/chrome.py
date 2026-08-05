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
    try:
        return TenantConfigSerializer().validate_navbar_config(merged)
    except drf_serializers.ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, list) and detail:
            detail = detail[0]
        raise ChromeOpError(str(detail)) from exc
