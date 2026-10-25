"""What an email can show of hers: her offers and pages (the ``item`` block, the editor's picker, the
team's drafts), her voice and her own photos (the Designer's brief).

Every item carries an absolute link on her site and a picture on a lasting link (images.stable_url), so a
sent email keeps working. Drafts and past events are left out: an email should never point at a page a
student can't open.
"""

import re
from zoneinfo import ZoneInfo

from django.db.models import F
from django.utils import timezone
from django.utils.html import strip_tags

from . import images

MAX_EACH = 20
SLOTS = {
    "next:event": "Your next class or event",
    "latest:course": "Your newest course",
    "latest:post": "Your latest article",
    "latest:download": "Your newest download",
}
# The looks' fonts that are serifs. Gmail shows no web fonts, so the fallback is what most people read.
# ponytail: a look with a new serif font joins this set, or its emails fall back to a sans-serif.
SERIF_FONTS = {
    "Alegreya", "Bodoni Moda", "Cinzel", "Cormorant", "Fraunces", "Instrument Serif", "Literata", "Newsreader",
    "Playfair Display", "Shippori Mincho", "Source Serif 4", "Spectral", "Young Serif", "Zilla Slab",
}  # fmt: skip
_PAGE_PATH = re.compile(r"/[\w/-]*")
_EVENT_LABELS = {"live": "Live class", "stream": "Live stream", "zoom": "Zoom class", "onsite": "In-person event"}


def font_stack(font: str) -> str:
    return f"'{font}', Georgia, serif" if font in SERIF_FONTS else f"'{font}', Helvetica, Arial, sans-serif"


def zone_of(cfg) -> ZoneInfo:
    try:
        return ZoneInfo(getattr(cfg, "timezone", "") or "UTC")
    except (KeyError, ValueError, OSError):  # an unknown zone name
        return ZoneInfo("UTC")


def when(moment, zone) -> str:
    """ "Tuesday 5 November 2030, 18:00 (Europe/Berlin)": her wall clock, so nobody converts."""
    local = moment.astimezone(zone)
    return f"{local:%A} {local.day} {local:%B %Y, %H:%M} ({zone.key})"


def short_when(moment, zone) -> str:
    """ "Tue 5 Nov, 18:00 Berlin time": an event's date on its card."""
    local = moment.astimezone(zone)
    city = zone.key.rsplit("/", 1)[-1].replace("_", " ")
    return f"{local:%a} {local.day} {local:%b}, {local:%H:%M}" + (f" {city} time" if city != "UTC" else " UTC")


def _item(ref, kind, title, url, *, summary="", image="", meta="", label=""):
    return {
        "ref": ref,
        "kind": kind,
        "kindLabel": label or kind.title(),
        "title": str(title)[:160],
        "summary": " ".join(strip_tags(summary or "").split())[:280],
        "image": image,
        "url": url,
        "meta": meta,
    }


def _price(obj) -> str:
    """How a student gets it, in a few words: "Free", "€49", "€49 · or with Studio membership",
    "Included in Studio membership"."""
    from apps.billing.models import SubscriptionPlan
    from apps.billing.ways import WaysError, ways_of
    from apps.tenant_config.interview_brief import money

    try:
        ways = ways_of(obj)
    except WaysError:  # it names a subscription that is gone
        return ""
    parts = []
    if ways.get("free"):
        parts.append("Free")
    if ways.get("buy"):
        parts.append(money(ways["buy"]["price"]))
    if ways.get("plans"):
        ids = [p["plan_id"] for p in ways["plans"]]
        names = list(dict.fromkeys(SubscriptionPlan.objects.filter(pk__in=ids).values_list("name", flat=True)))
        if len(names) == 1:
            parts.append(("or with " if parts else "Included in ") + names[0])
        elif names:
            parts.append("or with a membership" if parts else "Included in membership")
    return " · ".join(parts)


def _course(c, site):
    return _item(
        f"course:{c.id}",
        "course",
        c.title,
        f"{site}/courses/{c.slug}",
        summary=c.description,
        image=images.stable_url_for(c.thumbnail, c.thumbnail_url, site=site),
        meta=_price(c),
        label="Course",
    )


def _event(kind, event, site, zone):
    from apps.core.copilot import content

    price = _price(event)
    return _item(
        f"{kind}:{event.id}",
        kind,
        event.title,
        f"{site}/calendar/{content.EVENT_KINDS[kind][3]}/{event.id}",
        summary=event.description,
        image=images.stable_url_for(event.thumbnail, event.thumbnail_url, site=site),
        meta=" · ".join(p for p in (short_when(event.scheduled_at, zone), price) if p),
        label=_EVENT_LABELS[kind],
    )


def _download(d, site):
    return _item(
        f"download:{d.id}",
        "download",
        d.title,
        f"{site}/store",
        summary=d.description,
        image=images.stable_url_for(d.thumbnail, site=site),
        meta=_price(d),
        label="Download",
    )


def _post(p, site):
    return _item(
        f"post:{p.id}",
        "post",
        p.title,
        f"{site}/blog/{p.slug}",
        summary=p.excerpt,
        image=images.stable_url_for(p.cover_photo, site=site),
        label="Article",
    )


def _plan(p, site):
    from apps.tenant_config.interview_brief import money

    every = {1: "a month", 12: "a year"}.get(p.billing_interval_months, f"every {p.billing_interval_months} months")
    return _item(
        f"plan:{p.id}",
        "plan",
        p.name,
        f"{site}/plans/{p.id}",
        summary=p.description,
        meta=f"{money(p.price)} {every}",
        label="Membership",
    )


def _courses():
    from apps.courses.models import Course

    return Course.objects.filter(is_published=True).select_related("thumbnail")


def _events(now):
    from apps.core.copilot import content

    return {
        kind: content.event_model(kind).objects.filter(scheduled_at__gte=now).select_related("thumbnail")
        for kind in content.EVENT_KINDS
    }


def _downloads():
    from apps.downloads.models import DownloadFile

    return DownloadFile.objects.filter(is_published=True).exclude(file_url="").select_related("thumbnail")


def _posts():
    from apps.blog.models import BlogPost

    return BlogPost.objects.filter(status="published").select_related("cover_photo")


def _plans():
    from apps.billing.models import SubscriptionPlan

    return SubscriptionPlan.objects.filter(is_active=True)


def _pages(cfg, site) -> list[dict]:
    """Her home page and the pages her own navigation links to."""
    pages = {"page:home": _item("page:home", "page", "Home", f"{site}/", label="Page")}
    for link in (getattr(cfg, "navbar_config", None) or {}).get("links") or []:
        href = str(link.get("href") or "") if isinstance(link, dict) else ""
        if href != "/" and _PAGE_PATH.fullmatch(href):
            ref = f"page:{href.strip('/')}"
            pages.setdefault(ref, _item(ref, "page", link.get("label") or href, f"{site}{href}", label="Page"))
    return list(pages.values())


def _config():
    from apps.tenant_config.models import TenantConfig

    return TenantConfig.objects.first()


def site_of(tenant) -> str:
    from apps.notifications.email_render import tenant_base_url

    return tenant_base_url(tenant)


def items(tenant, cfg=None) -> list[dict]:
    """Everything she can feature, newest or soonest first per kind, then her pages."""
    cfg = cfg or _config()
    site, zone, now = site_of(tenant), zone_of(cfg), timezone.now()
    events = sorted(
        ((kind, e) for kind, qs in _events(now).items() for e in qs.order_by("scheduled_at")[:MAX_EACH]),
        key=lambda row: row[1].scheduled_at,
    )
    return [
        *(_course(c, site) for c in _courses().order_by("order", "-created_at")[:MAX_EACH]),
        *(_event(kind, e, site, zone) for kind, e in events[:MAX_EACH]),
        *(_download(d, site) for d in _downloads().order_by("-created_at")[:MAX_EACH]),
        *(_post(p, site) for p in _posts().order_by(F("published_at").desc(nulls_last=True), "-created_at")[:MAX_EACH]),
        *(_plan(p, site) for p in _plans().order_by("sort_order", "pk")[:MAX_EACH]),
        *_pages(cfg, site),
    ]


def _slot(ref, tenant, cfg):
    """The item a live slot points at right now, or None."""
    site = site_of(tenant)
    if ref == "next:event":
        now = timezone.now()
        soonest = [(kind, qs.order_by("scheduled_at").first()) for kind, qs in _events(now).items()]
        soonest = [(kind, e) for kind, e in soonest if e is not None]
        if not soonest:
            return None
        kind, event = min(soonest, key=lambda row: row[1].scheduled_at)
        return _event(kind, event, site, zone_of(cfg))
    if ref == "latest:course":
        c = _courses().order_by("-created_at").first()
        return _course(c, site) if c else None
    if ref == "latest:post":
        p = _posts().order_by(F("published_at").desc(nulls_last=True), "-created_at").first()
        return _post(p, site) if p else None
    if ref == "latest:download":
        d = _downloads().order_by("-created_at").first()
        return _download(d, site) if d else None
    return None


def find(refs, tenant, cfg=None) -> dict[str, dict]:
    """{ref: item} for the refs that still resolve (live slots included), one query per kind."""
    from apps.core.copilot import content

    refs = [str(r) for r in refs]
    cfg = cfg or _config()
    site, zone, now = site_of(tenant), zone_of(cfg), timezone.now()
    wanted: dict[str, set[int]] = {}
    found: dict[str, dict] = {}
    for ref in set(refs):
        if ref in SLOTS:
            item = _slot(ref, tenant, cfg)
            if item:
                found[ref] = {**item, "ref": ref}
            continue
        kind, _, raw_id = str(ref).partition(":")
        if kind == "page":
            continue
        if raw_id.isdigit():
            wanted.setdefault(kind, set()).add(int(raw_id))
    if "course" in wanted:
        found.update({f"course:{c.id}": _course(c, site) for c in _courses().filter(pk__in=wanted["course"])})
    for kind in content.EVENT_KINDS:
        if kind in wanted:
            qs = _events(now)[kind].filter(pk__in=wanted[kind])
            found.update({f"{kind}:{e.id}": _event(kind, e, site, zone) for e in qs})
    if "download" in wanted:
        found.update({f"download:{d.id}": _download(d, site) for d in _downloads().filter(pk__in=wanted["download"])})
    if "post" in wanted:
        found.update({f"post:{p.id}": _post(p, site) for p in _posts().filter(pk__in=wanted["post"])})
    if "plan" in wanted:
        found.update({f"plan:{p.id}": _plan(p, site) for p in _plans().filter(pk__in=wanted["plan"])})
    pages = {p["ref"]: p for p in _pages(cfg, site)}
    found.update({ref: pages[ref] for ref in refs if ref in pages})
    return found


def slots(tenant, cfg=None) -> list[dict]:
    """The live slots with what each shows today (an empty slot is left out)."""
    found = find(SLOTS, tenant, cfg)
    return [{**found[ref], "slotLabel": label} for ref, label in SLOTS.items() if ref in found]


def voice(tenant, cfg=None) -> dict:
    """How she talks and what she teaches, from her setup answers and her look's mood."""
    from apps.tenant_config import sections
    from apps.tenant_config.interview_brief import answers_of, speaker_of

    cfg = cfg or _config()
    answers = answers_of(tenant)
    out = {
        key: str(answers[key])[:300]
        for key in ("teaches", "audience", "outcome", "tone", "pitch", "story")
        if answers.get(key)
    }
    if said := speaker_of(answers):
        out["speaks_as"] = said  # "I" or "we", as she answered who students learn from
    look = sections.style(getattr(cfg, "style", "") or "") or {}
    if look.get("mood"):
        out["mood"] = look["mood"]
    if look.get("photoWords"):
        out["photo_style"] = look["photoWords"]
    if getattr(cfg, "default_locale", ""):
        out["language"] = cfg.default_locale
    return out


def photos(tenant, cfg=None, limit: int = 24) -> list[dict]:
    """Her own photos the image service has described (a file name says nothing about a photo), on
    lasting links: what the Designer may put in an email."""
    from apps.media import own_photos

    cfg = cfg or _config()
    site = site_of(tenant)
    out = []
    for photo in own_photos.own_photos().exclude(alt_text="")[:limit]:
        url = images.stable_url_for(photo, site=site)
        if url:
            out.append(
                {
                    "id": str(photo.pk),
                    "description": photo.alt_text,
                    "aspect": own_photos.orientation_of(photo) or "",
                    "url": url,
                }
            )
    return out
