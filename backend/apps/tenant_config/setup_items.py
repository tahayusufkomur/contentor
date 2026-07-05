"""Computes the Setup Assistant checklist from live tenant state.

The API returns state only (key/group/done/source/optional) — titles,
descriptions, icons, and deep links live in the frontend catalog, where
next-intl owns the copy.
"""

from collections import defaultdict

from apps.core.monetization import can_monetize, is_paid_active

from .models import SeededObject
from .seeding import fingerprint_for

CORE_PAGE_KEYS = ("home", "about", "courses", "pricing", "faq", "contact")

ALL_ITEM_KEYS = frozenset(
    [f"page_{page}" for page in CORE_PAGE_KEYS]
    + [
        "look",
        "first_course",
        "demo_cleanup",
        "payouts",
        "publish",
        "first_download",
        "first_live",
        "first_announcement",
        "share_site",
        "studio_email",
    ]
)


def _seeded_by_label():
    grouped = defaultdict(list)
    for row in SeededObject.objects.select_related("content_type"):
        grouped[f"{row.content_type.app_label}.{row.content_type.model}"].append(row)
    return grouped


def _has_own(model, rows) -> bool:
    """A non-demo object exists: anything outside the registry, or a
    registered object whose content no longer matches its seed fingerprint."""
    if model.objects.exclude(pk__in=[row.object_id for row in rows]).exists():
        return True
    for row in rows:  # bounded by seed volume (small)
        obj = model.objects.filter(pk=row.object_id).first()
        if obj is not None and fingerprint_for(obj) != row.fingerprint:
            return True
    return False


def compute_setup_state(config, tenant) -> dict:
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
    from apps.notifications.models import Announcement

    progress = config.setup_progress or {}
    pages_edited = set(progress.get("pages_edited", []))
    manual = progress.get("manual", {})
    seeded = _seeded_by_label()
    seeded_rows_exist = any(seeded.values())
    was_seeded = seeded_rows_exist or getattr(tenant, "template_seed_status", "") == "ready"
    modules = config.enabled_modules or []
    published = bool(getattr(tenant, "is_published", False))

    items = []

    def add(key, group, auto, optional=False):
        done = bool(auto) or manual.get(key) is True
        source = "auto" if auto else ("manual" if manual.get(key) is True else None)
        items.append({"key": key, "group": group, "done": done, "source": source, "optional": optional})

    for page in CORE_PAGE_KEYS:
        add(f"page_{page}", "site", page in pages_edited)
    add(
        "look",
        "site",
        bool(progress.get("look_edited")) or bool(config.logo_id or config.logo_url),
    )
    add("first_course", "content", _has_own(Course, seeded.get("courses.course", [])))
    if was_seeded:
        add("demo_cleanup", "content", not seeded_rows_exist)
    add("payouts", "business", can_monetize(tenant))
    add("publish", "live", published)

    if "downloads" in modules:
        add(
            "first_download",
            "extras",
            _has_own(DownloadFile, seeded.get("downloads.downloadfile", [])),
            optional=True,
        )
    if "live" in modules:
        live_pairs = (
            (LiveClass, "live.liveclass"),
            (LiveStream, "live.livestream"),
            (ZoomClass, "live.zoomclass"),
            (OnsiteEvent, "live.onsiteevent"),
        )
        add(
            "first_live",
            "extras",
            any(_has_own(model, seeded.get(label, [])) for model, label in live_pairs),
            optional=True,
        )
    add("first_announcement", "extras", Announcement.objects.exists(), optional=True)
    if published:
        add("share_site", "extras", False, optional=True)
    if is_paid_active(tenant):
        from apps.domains.models import PlatformMailboxAddress

        add(
            "studio_email",
            "extras",
            PlatformMailboxAddress.objects.filter(tenant=tenant).exists(),
            optional=True,
        )

    core = [item for item in items if not item["optional"]]
    return {
        "items": items,
        "progress": {
            "done": sum(1 for item in core if item["done"]),
            "total": len(core),
        },
        "demo_present": seeded_rows_exist,
        "dismissed": config.setup_guide_dismissed,
    }
