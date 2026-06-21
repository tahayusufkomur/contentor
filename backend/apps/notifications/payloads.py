from apps.tenant_config.models import TenantConfig


def _brand() -> dict:
    cfg = TenantConfig.objects.first()
    return {
        "icon": (cfg.logo_url if cfg and cfg.logo_url else "/pwa-icon?size=192"),
        "brand": (cfg.brand_name if cfg else "Contentor"),
    }


def live_reminder_payload(title: str, url: str = "/live-classes") -> dict:
    b = _brand()
    return {
        "title": b["brand"],
        "body": f"Starting soon: {title}",
        "icon": b["icon"],
        "url": url,
        "tag": "live-reminder",
    }


def new_content_payload(title: str, url: str) -> dict:
    b = _brand()
    return {"title": b["brand"], "body": f"New: {title}", "icon": b["icon"], "url": url, "tag": "new-content"}


def strip_to_text(html: str) -> str:
    """HTML → plaintext for push bodies (nh3 with no allowed tags)."""
    if not html:
        return ""
    import html as html_module

    import nh3

    return html_module.unescape(nh3.clean(html, tags=set(), attributes={})).strip()


def announcement_payload(title: str, body_html: str, url: str = "/announcements") -> dict:
    b = _brand()
    return {
        "title": title or b["brand"],
        "body": strip_to_text(body_html),
        "icon": b["icon"],
        "url": url or "/announcements",
        "tag": "announcement",
    }
