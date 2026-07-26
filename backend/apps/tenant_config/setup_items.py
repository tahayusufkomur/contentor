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
        "first_event",
        "demo_cleanup",
        "payouts",
        "publish",
        "first_download",
        "first_live",
        "first_announcement",
        "first_blog_post",
        "first_community_post",
        "share_site",
        "studio_email",
    ]
)

EVENT_GOALS = frozenset({"run_live_classes", "in_person_events"})
BLOG_GOAL = "write_blog"


def _wizard_goals(tenant) -> list[str]:
    """Goals the coach declared in the signup wizard. `wizard_state` survives
    provisioning untouched, so this is readable for the tenant's whole life."""
    state = getattr(tenant, "wizard_state", None) or {}
    return ((state.get("answers") or {}).get("goals")) or []


def _live_entitled(tenant) -> bool:
    """The plan's `is_live_enabled` flag — the same source
    apps/billing/views/platform.py uses for the `live` entitlement. Django's
    reverse-one-to-one raises a DoesNotExist that also subclasses
    AttributeError, so getattr with a default covers 'no subscription'."""
    plan = getattr(getattr(tenant, "platform_subscription", None), "plan", None)
    return bool(plan and plan.is_live_enabled)


def _seeded_by_label():
    grouped = defaultdict(list)
    for row in SeededObject.objects.select_related("content_type"):
        grouped[f"{row.content_type.app_label}.{row.content_type.model}"].append(row)
    return grouped


def _has_own(model, rows, *, queryset=None) -> bool:
    """A non-demo object exists: anything outside the registry, or a
    registered object whose content no longer matches its seed fingerprint.

    ``queryset`` narrows what counts — the publish gate passes a published-only
    queryset so a draft never unlocks going live."""
    qs = model.objects.all() if queryset is None else queryset
    seeded_ids = [row.object_id for row in rows]
    if qs.exclude(pk__in=seeded_ids).exists():
        return True
    for row in rows:  # bounded by seed volume (small)
        obj = qs.filter(pk=row.object_id).first()
        if obj is not None and fingerprint_for(obj) != row.fingerprint:
            return True
    return False


def _has_paid_content(seeded) -> bool:
    """The coach sells at least one paid (price > 0) course or download of
    their own. Demo-seeded rows are excluded so an unremoved demo (which may
    contain paid items) never spuriously demands payout onboarding."""
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    course_demo = [row.object_id for row in seeded.get("courses.course", [])]
    dl_demo = [row.object_id for row in seeded.get("downloads.downloadfile", [])]
    return (
        Course.objects.filter(price__gt=0).exclude(pk__in=course_demo).exists()
        or DownloadFile.objects.filter(price__gt=0).exclude(pk__in=dl_demo).exists()
    )


def publish_blockers(config, tenant) -> list[str]:
    """Requirements a coach must satisfy before going live (decision 2026-07-05).

    Returns the unmet requirement keys (empty list = ready to publish). Unlike
    the checklist, this reads REAL state only — manual "mark done" overrides
    never satisfy a hard publish requirement.

      - ``look``            — a logo/brand is set
      - ``first_course``    — at least one own PUBLISHED course, or own download
      - ``first_event``     — an own live/onsite event, only if the coach's wizard
                              goals ask for one AND their plan entitles them to it
      - ``first_blog_post`` — an own published post, only if the goals ask for one
      - ``payouts``         — Connect onboarding done, only if paid content exists

    Content blockers are goal- AND entitlement-conditional: a coach is never
    gated on a content type they did not choose, nor on one their plan cannot
    create (the free plan has ``is_live_enabled`` False), which would leave the
    gate permanently unsatisfiable.

    ``demo_cleanup`` is deliberately NOT a blocker (see the AI-seeding plan):
    seeded content is niche-appropriate AI/starter content the coach may
    reasonably ship as-is, and registering it as ``SeededObject`` rows must
    never gate going live. It remains a non-blocking checklist nudge in
    ``compute_setup_state``.
    """
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    progress = config.setup_progress or {}
    seeded = _seeded_by_label()

    blockers = []
    if not (bool(progress.get("look_edited")) or bool(config.logo_id or config.logo_url)):
        blockers.append("look")
    # demo_cleanup is NO LONGER a publish blocker: seeded content is now
    # niche-appropriate AI/starter content (see the AI-seeding plan), which
    # must never block going live. It remains a non-blocking checklist nudge
    # ("review your starter content") in compute_setup_state.
    has_own_product = _has_own(
        Course, seeded.get("courses.course", []), queryset=Course.objects.filter(is_published=True)
    ) or _has_own(DownloadFile, seeded.get("downloads.downloadfile", []))
    if not has_own_product:
        blockers.append("first_course")

    goals = _wizard_goals(tenant)
    if EVENT_GOALS.intersection(goals) and _live_entitled(tenant):
        from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

        live_pairs = (
            (LiveClass, "live.liveclass"),
            (LiveStream, "live.livestream"),
            (ZoomClass, "live.zoomclass"),
            (OnsiteEvent, "live.onsiteevent"),
        )
        if not any(_has_own(model, seeded.get(label, [])) for model, label in live_pairs):
            blockers.append("first_event")

    if BLOG_GOAL in goals:
        from apps.blog.models import BlogPost

        if not _has_own(
            BlogPost, seeded.get("blog.blogpost", []), queryset=BlogPost.objects.filter(status="published")
        ):
            blockers.append("first_blog_post")

    if _has_paid_content(seeded) and not can_monetize(tenant):
        blockers.append("payouts")
    return blockers


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
    # Goal-driven extras: only for tenants whose wizard signup declared the
    # matching intent (wizard_state survives provisioning untouched).
    wizard_goals = (((getattr(tenant, "wizard_state", None) or {}).get("answers") or {}).get("goals")) or []
    if "write_blog" in wizard_goals:
        from apps.blog.models import BlogPost

        add("first_blog_post", "extras", BlogPost.objects.exists(), optional=True)
    if "build_community" in wizard_goals:
        from apps.community.models import Post

        add("first_community_post", "extras", Post.objects.exists(), optional=True)
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
        "has_paid_content": _has_paid_content(seeded),
        "publish_blockers": publish_blockers(config, tenant),
    }
