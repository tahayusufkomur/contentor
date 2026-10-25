"""A design as an image file: the photo studio's Download, for a post, a story or a thumbnail.

Covers are drawn live by the front end (CoverArt), so a file is a photograph of that drawing: the browser
sidecar (infra/browser, the one the site's final visual check uses) opens a page of her own site that
draws the design alone (`/render/cover/<token>`) and takes a picture of it. The token is signed and lives
for two minutes: it is all the page needs to read the design, so the page asks for no sign-in.

Runs inside the tenant context (media is a TENANT_APP).
"""

import base64

import requests
from django.conf import settings
from django.core import signing
from django.db import connection

from . import designs
from .design_recipe import SIZES, SOCIAL_SIZES

_SALT = "contentor.design-render"
TOKEN_AGE = 120
FORMATS = {"png": "image/png", "jpeg": "image/jpeg"}
# The width of each size's file in px; its height follows from the size's shape (the page draws the design
# that wide, in its shape). Wide is a YouTube thumbnail, Banner a header image, the others a feed's width.
WIDTHS = {"card": 1080, "wide": 1280, "banner": 1500, "post": 1080, "portrait": 1080, "story": 1080}
_RENDER_TIMEOUT = 60


class ExportError(Exception):
    """Why a design could not be made into a file, in words safe to show her."""


def available() -> bool:
    return bool(settings.SITE_QA_BROWSER_URL)


def token_for(design, size: str) -> str:
    return signing.dumps({"d": str(design.pk), "s": size, "t": connection.schema_name}, salt=_SALT)


def read_token(token: str) -> tuple[str, str] | None:
    """(design id, size) of a token this site signed in the last two minutes, or None."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=TOKEN_AGE)
    except signing.BadSignature:
        return None
    if not isinstance(data, dict) or data.get("t") != connection.schema_name:
        return None
    size = data.get("s")
    return (str(data.get("d")), size) if size in SIZES or size in SOCIAL_SIZES else None


def item_of(design) -> dict:
    """What the cover is drawn for, as the studio gives CoverArt: its title, when a course or download was
    made (its New badge) and a series' next session (its date badge), read in the site's time zone."""
    from django.utils import timezone

    from apps.tenant_config.models import TenantConfig

    rows = designs.target_rows(design.target_kind, design.target_key)
    config = TenantConfig.objects.only("timezone").first()
    item = {
        "title": designs.target_title(design.target_kind, design.target_key),
        "createdAt": None,
        "startsAt": None,
        "timeZone": config.timezone if config else None,
    }
    if design.target_kind in designs.BY_ID:
        item["createdAt"] = rows[0].created_at.isoformat() if rows else None
    else:
        now = timezone.now()
        upcoming = [row.scheduled_at for row in rows if row.scheduled_at and row.scheduled_at >= now]
        item["startsAt"] = min(upcoming).isoformat() if upcoming else None
    return item


def render(design, size: str, fmt: str) -> bytes:
    """The design at `size` as a PNG or JPEG file. Raises ExportError."""
    host = connection.tenant.domains.order_by("-is_primary").values_list("domain", flat=True).first()
    if not host:
        raise ExportError("this site has no address to draw the design on")
    try:
        res = requests.post(
            f"{settings.SITE_QA_BROWSER_URL.rstrip('/')}/render",
            json={
                "url": f"http://{host}/render/cover/{token_for(design, size)}",
                "width": WIDTHS[size],
                "format": fmt,
                "selector": "[data-render-cover]",
            },
            timeout=_RENDER_TIMEOUT,
        )
        res.raise_for_status()
        return base64.b64decode(res.json()["image"])
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise ExportError("the design could not be drawn as a file right now") from exc
