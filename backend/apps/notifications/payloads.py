from apps.tenant_config.models import TenantConfig


def _brand() -> dict:
    cfg = TenantConfig.objects.first()
    return {
        "icon": (cfg.logo_url if cfg and cfg.logo_url else "/pwa-icon?size=192"),
        "brand": (cfg.brand_name if cfg else "Contentor"),
    }


def live_reminder_payload(title: str, url: str = "/live-classes") -> dict:
    b = _brand()
    return {"title": b["brand"], "body": f"Starting soon: {title}", "icon": b["icon"], "url": url, "tag": "live-reminder"}


def new_content_payload(title: str, url: str) -> dict:
    b = _brand()
    return {"title": b["brand"], "body": f"New: {title}", "icon": b["icon"], "url": url, "tag": "new-content"}


def broadcast_payload(message: str) -> dict:
    b = _brand()
    return {"title": b["brand"], "body": message, "icon": b["icon"], "url": "/", "tag": "broadcast"}
