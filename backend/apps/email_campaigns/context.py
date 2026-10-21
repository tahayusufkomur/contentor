"""What MailCraft's AI is told about the coach when she opens the email builder: her brand (from
her look and her setup answers), what she offers, and her own photos.

MailCraft shows its model ids, titles, prices and dates, and keeps the URLs to itself (its
templates_api.generation), so an AI email links only to the pages listed here. Pictures are
signed for the builder session's four hours; MailCraft copies the ones an email uses when it is
written, as email-safe files.
"""

import re
from zoneinfo import ZoneInfo

from django.db.models import F
from django.utils import timezone
from django.utils.html import strip_tags

from apps.core.storage import generate_presigned_download_url

SESSION_SECONDS = 4 * 3600  # MailCraft's builder session
MAX_ITEMS = 30  # all MailCraft shows its model (and 24 photos); the kinds below share it: 5+4+6+6+3+3+3
MAX_PHOTOS = 24
# MailCraft's palette keys -> the look's colour tokens.
_PALETTE = {
    "primary": "primary",
    "secondary": "accent",
    "textDark": "foreground",
    "textLight": "mutedForeground",
    "background": "background",
    "surface": "surface",
}
# The looks' fonts that are serifs. Gmail shows no web fonts, so the fallback is what most people read.
# ponytail: a look with a new serif font joins this set, or its emails fall back to a sans-serif.
SERIF_FONTS = {
    "Alegreya", "Bodoni Moda", "Cinzel", "Cormorant", "Fraunces", "Instrument Serif", "Literata", "Newsreader",
    "Playfair Display", "Shippori Mincho", "Source Serif 4", "Spectral", "Young Serif", "Zilla Slab",
}  # fmt: skip
_PAGE_PATH = re.compile(r"/[\w/-]*")


def email_context(tenant) -> dict:
    """{"brand", "items", "photos"} for MailCraft's builder session (its host context)."""
    from apps.notifications.email_render import tenant_base_url
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.select_related("logo").first()
    site = tenant_base_url(tenant)
    items = [*_pages(cfg, site), *_socials(cfg), *_events(cfg, site), *_courses(site), *_downloads(site)]
    items += [*_plans(site), *_posts(site)]
    return {"brand": _brand(tenant, cfg, site), "items": items[:MAX_ITEMS], "photos": _photos(cfg)[:MAX_PHOTOS]}


def _brand(tenant, cfg, site) -> dict:
    from apps.tenant_config import sections
    from apps.tenant_config.interview_brief import answers_of

    style_id = cfg.style if sections.style(cfg.style) else sections.default_style()
    look = sections.style(style_id) or {}
    colours = (sections.palettes(style_id).get(cfg.palette) or {}).get("palette") or look.get("palette") or {}
    fonts = look.get("fonts") or {}
    answers = answers_of(tenant)
    voice = {key: str(answers[key])[:300] for key in ("teaches", "tone", "pitch") if answers.get(key)}
    if look.get("mood"):
        voice["mood"] = look["mood"]
    return {
        "name": cfg.brand_name or tenant.name,
        "site_url": site,
        "language": cfg.default_locale,
        "custom_palette": {
            key: hex_value
            for key, token in _PALETTE.items()
            if (hex_value := sections.oklch_to_hex(colours.get(token)))
        },
        "fonts": {
            key: _font_stack(fonts[font]) for key, font in (("heading", "display"), ("body", "body")) if fonts.get(font)
        },
        "voice": voice,
        "photo_style": look.get("photoWords", ""),
    }


def _font_stack(font: str) -> str:
    return f"'{font}', Georgia, serif" if font in SERIF_FONTS else f"'{font}', Helvetica, Arial, sans-serif"


def _item(item_id, kind, title, url="", **fields) -> dict:
    return {"id": item_id, "kind": kind, "title": str(title)[:120], "url": url, **fields}


def _summary(text) -> str:
    return " ".join(strip_tags(text or "").split())[:280]


def _picture(photo=None, stored="") -> str:
    """A picture readable for the builder session: a Photo, else a stored key or an outside URL."""
    key = photo.s3_key if photo is not None and photo.s3_key else (stored or "")
    if not key or key.startswith("http"):
        return key
    return generate_presigned_download_url(key, expiry=SESSION_SECONDS)


def _price(obj) -> str:
    """How it is had, in her words ("€49 once, theirs to keep."), as the copilot describes it."""
    from apps.billing.ways import WaysError, describe, ways_of

    try:
        return describe(ways_of(obj))
    except WaysError:  # it names a subscription that is gone
        return ""


def _pages(cfg, site) -> list[dict]:
    """Her home page and the pages her own navigation links to."""
    pages = {"page:home": _item("page:home", "page", "Home", f"{site}/")}
    for link in (cfg.navbar_config or {}).get("links") or []:
        href = str(link.get("href") or "") if isinstance(link, dict) else ""
        if href != "/" and _PAGE_PATH.fullmatch(href):
            item_id = f"page:{href.strip('/')}"
            pages.setdefault(item_id, _item(item_id, "page", link.get("label") or href, f"{site}{href}"))
    return list(pages.values())[:5]


def _socials(cfg) -> list[dict]:
    links = (cfg.social_links or {}).items()
    return [
        _item(f"social:{network}", "social", str(network).title(), url)
        for network, url in links
        if isinstance(url, str) and url.startswith(("https://", "http://"))
    ][:4]


def _events(cfg, site) -> list[dict]:
    """The next classes and events, soonest first, at her own clock. Events have no publish step: one
    that exists has its calendar page."""
    from apps.core.copilot import content

    zone = _zone(cfg)
    now = timezone.now()
    rows = sorted(
        (
            (kind, event)
            for kind in content.EVENT_KINDS
            for event in content.event_model(kind)
            .objects.filter(scheduled_at__gte=now)
            .select_related("thumbnail")
            .order_by("scheduled_at")[:6]
        ),
        key=lambda row: row[1].scheduled_at,
    )[:6]
    return [
        _item(
            f"{kind}:{event.id}",
            content.EVENT_KINDS[kind][4],
            event.title,
            f"{site}/calendar/{content.EVENT_KINDS[kind][3]}/{event.id}",
            summary=_summary(event.description),
            price=_price(event),
            when=_when(event.scheduled_at, zone),
            status="scheduled",
            image_url=_picture(event.thumbnail, event.thumbnail_url),
        )
        for kind, event in rows
    ]


def _zone(cfg) -> ZoneInfo:
    try:
        return ZoneInfo(cfg.timezone or "UTC")
    except (KeyError, ValueError, OSError):  # an unknown zone name
        return ZoneInfo("UTC")


def _when(moment, zone) -> str:
    """ "Tuesday 5 November 2030, 18:00 (Europe/Berlin)": her wall clock, so the model never converts."""
    local = moment.astimezone(zone)
    return f"{local:%A} {local.day} {local:%B %Y, %H:%M} ({zone.key})"


def _courses(site) -> list[dict]:
    """Her courses in her own order, published first. A draft has no page yet, so no link."""
    from apps.courses.models import Course

    courses = Course.objects.select_related("thumbnail").order_by("-is_published", "order", "-created_at")[:6]
    return [
        _item(
            f"course:{c.id}",
            "course",
            c.title,
            f"{site}/courses/{c.slug}" if c.is_published else "",
            summary=_summary(c.description),
            price=_price(c),
            status="published" if c.is_published else "draft",
            image_url=_picture(c.thumbnail, c.thumbnail_url),
        )
        for c in courses
    ]


def _downloads(site) -> list[dict]:
    """Downloads she sells: the store is their page."""
    from apps.downloads.models import DownloadFile

    downloads = DownloadFile.objects.filter(is_published=True, pricing_type="paid").exclude(file_url="")
    return [
        _item(
            f"download:{d.id}",
            "download",
            d.title,
            f"{site}/store",
            summary=_summary(d.description),
            price=_price(d),
            status="published",
            image_url=_picture(d.thumbnail),
        )
        for d in downloads.select_related("thumbnail").order_by("-created_at")[:3]
    ]


def _plans(site) -> list[dict]:
    from apps.billing.models import SubscriptionPlan
    from apps.tenant_config.interview_brief import money

    def cycle(months):
        return {1: "monthly", 12: "yearly"}.get(months, f"every {months} months")

    return [
        _item(
            f"plan:{p.id}",
            "subscription",
            p.name,
            f"{site}/plans/{p.id}",
            summary=_summary(p.description),
            price=f"{money(p.price)} {cycle(p.billing_interval_months)}",
            status="on sale",
        )
        for p in SubscriptionPlan.objects.filter(is_active=True).order_by("sort_order", "pk")[:3]
    ]


def _posts(site) -> list[dict]:
    from apps.blog.models import BlogPost

    posts = BlogPost.objects.filter(status="published").select_related("cover_photo")
    return [
        _item(
            f"post:{p.id}",
            "blog post",
            p.title,
            f"{site}/blog/{p.slug}",
            summary=_summary(p.excerpt),
            status="published",
            image_url=_picture(p.cover_photo),
        )
        for p in posts.order_by(F("published_at").desc(nulls_last=True), "-created_at")[:3]
    ]


def _photos(cfg) -> list[dict]:
    """Her logo, then the photos she uploaded herself that the image service has described (one not
    described yet carries only a file name, which says nothing about what it shows)."""
    from apps.media import own_photos

    photos = []
    logo = _picture(cfg.logo, cfg.logo_url)
    if logo:
        photos.append(
            {
                "id": "logo",
                "description": f"the {cfg.brand_name} logo",
                "aspect": (own_photos.orientation_of(cfg.logo) if cfg.logo else None) or "",
                "url": logo,
            }
        )
    for photo in own_photos.own_photos().exclude(alt_text="")[:MAX_PHOTOS]:
        url = _picture(photo)
        if url:
            photos.append(
                {
                    "id": f"photo:{photo.pk}",
                    "description": photo.alt_text,
                    "aspect": own_photos.orientation_of(photo) or "",
                    "url": url,
                }
            )
    return photos
