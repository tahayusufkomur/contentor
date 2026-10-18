"""Computes the Setup Assistant checklist from live tenant state.

The API returns state only (key/group/done/source/optional) — titles,
descriptions, icons, and deep links live in the frontend catalog, where
next-intl owns the copy.
"""

from collections import defaultdict

from apps.core.currency import tenant_charge_currency
from apps.core.monetization import can_monetize, is_paid_active

from .models import SeededObject
from .seeding import fingerprint_for

CORE_PAGE_KEYS = ("home", "about", "courses", "pricing", "faq", "contact")

ALL_ITEM_KEYS = frozenset(
    [f"page_{page}" for page in CORE_PAGE_KEYS]
    + [
        "look",
        "first_course",
        "course_lessons",
        "first_event",
        "demo_cleanup",
        "payouts",
        "start_selling",
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


def _has_paid_content(seeded, held_course=None) -> bool:
    """The coach sells at least one paid (price > 0) course or download of
    their own. Demo-seeded rows are excluded so an unremoved demo (which may
    contain paid items) never spuriously demands payout onboarding, and so is
    a course held back by "go live now, sell later" (``setup_flow["held"]``)."""
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    course_demo = [row.object_id for row in seeded.get("courses.course", [])] + [held_course]
    dl_demo = [row.object_id for row in seeded.get("downloads.downloadfile", [])]
    return (
        Course.objects.filter(pricing_type="paid", price__gt=0).exclude(pk__in=course_demo).exists()
        or DownloadFile.objects.filter(pricing_type="paid", price__gt=0).exclude(pk__in=dl_demo).exists()
    )


def _held_course_id(flow):
    """The course draft "go live now, sell later" holds back, if any."""
    return (flow.get("drafts") or {}).get("course") if (flow.get("held") or {}).get("course") else None


def _setup_course(flow):
    """The course /setup drafted, if it still exists."""
    from apps.courses.models import Course

    return Course.objects.filter(pk=(flow.get("drafts") or {}).get("course")).first()


def _course_expected(tenant, flow) -> bool:
    """Whether she is asked for a course of her own: not when /setup skipped
    the step or held her course for "sell later" (start_selling covers it),
    nor when her brief offers no courses (audit 2026-10-09; a brief without
    offers, from older signups, still asks)."""
    skipped = [*(flow.get("skipped") or []), *(["course"] if _held_course_id(flow) else [])]
    offers = ((getattr(tenant, "wizard_state", None) or {}).get("answers") or {}).get("offers")
    return "course" not in skipped and (not offers or "course" in offers)


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
      - ``plan``            — a trial or paid plan, for a tenant with no Free plan

    Content blockers are goal- AND entitlement-conditional: a coach is never
    gated on a content type they did not choose, nor on one their plan cannot
    create (the free plan has ``is_live_enabled`` False), which would leave the
    gate permanently unsatisfiable.

    The guided /setup flow can skip ``course``/``event``/``post``: a skipped
    step drops its blocker (``config.setup_flow["skipped"]``).

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
    if getattr(tenant, "is_paused", False):
        blockers.append("plan")
    if not (bool(progress.get("look_edited")) or bool(config.logo_id or config.logo_url)):
        blockers.append("look")
    # demo_cleanup is NO LONGER a publish blocker: seeded content is now
    # niche-appropriate AI/starter content (see the AI-seeding plan), which
    # must never block going live. It remains a non-blocking checklist nudge
    # ("review your starter content") in compute_setup_state.
    has_own_product = _has_own(
        Course, seeded.get("courses.course", []), queryset=Course.objects.filter(is_published=True)
    ) or _has_own(DownloadFile, seeded.get("downloads.downloadfile", []))
    flow = config.setup_flow or {}
    held_course = _held_course_id(flow)
    skipped = flow.get("skipped") or []
    # The course /setup drafted counts as hers while it waits for its lessons:
    # it goes live only once each has a video or text (Course.not_ready).
    if not has_own_product and _setup_course(flow) is None and _course_expected(tenant, flow):
        blockers.append("first_course")

    goals = _wizard_goals(tenant)
    if EVENT_GOALS.intersection(goals) and _live_entitled(tenant) and "event" not in skipped:
        from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

        live_pairs = (
            (LiveClass, "live.liveclass"),
            (LiveStream, "live.livestream"),
            (ZoomClass, "live.zoomclass"),
            (OnsiteEvent, "live.onsiteevent"),
        )
        if not any(_has_own(model, seeded.get(label, [])) for model, label in live_pairs):
            blockers.append("first_event")

    if BLOG_GOAL in goals and "post" not in skipped:
        from apps.blog.models import BlogPost

        if not _has_own(
            BlogPost, seeded.get("blog.blogpost", []), queryset=BlogPost.objects.filter(status="published")
        ):
            blockers.append("first_blog_post")

    if _has_paid_content(seeded, held_course=held_course) and not can_monetize(tenant):
        blockers.append("payouts")
    return blockers


def tenant_publish_blockers(tenant) -> list[str]:
    """``publish_blockers`` computed in the tenant's own schema (where the
    config + content live) — callable from the public schema too."""
    from django_tenants.utils import tenant_context

    from .models import TenantConfig

    with tenant_context(tenant):
        config = TenantConfig.objects.first()
        return publish_blockers(config, tenant) if config else []


def compute_setup_state(config, tenant) -> dict:
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
    from apps.notifications.models import Announcement

    from .interview_golive import _held_lines

    progress = config.setup_progress or {}
    pages_edited = set(progress.get("pages_edited", []))
    manual = progress.get("manual", {})
    seeded = _seeded_by_label()
    seeded_rows_exist = any(seeded.values())
    was_seeded = seeded_rows_exist or getattr(tenant, "template_seed_status", "") == "ready"
    modules = config.enabled_modules or []
    published = bool(getattr(tenant, "is_published", False))

    items = []

    def add(key, group, auto, optional=False, **extra):
        done = bool(auto) or manual.get(key) is True
        source = "auto" if auto else ("manual" if manual.get(key) is True else None)
        items.append({"key": key, "group": group, "done": done, "source": source, "optional": optional, **extra})

    flow = config.setup_flow or {}
    # The /setup interview builds her pages and she reviews each one there: a
    # page it built is done, and one it never built is not hers to set up.
    builds = (flow.get("page_builds") or {}) if "interview" in flow else None
    for page in CORE_PAGE_KEYS:
        if builds is None:
            add(f"page_{page}", "site", page in pages_edited)
        elif page in builds:
            add(f"page_{page}", "site", page in pages_edited or builds[page].get("status") == "ready")
    add(
        "look",
        "site",
        bool(progress.get("look_edited")) or bool(config.logo_id or config.logo_url),
    )
    # Same rule as the publish gate (publish_blockers): a draft course never
    # ticks this, or the checklist says done while Publish stays blocked.
    has_product = _has_own(
        Course, seeded.get("courses.course", []), queryset=Course.objects.filter(is_published=True)
    ) or _has_own(DownloadFile, seeded.get("downloads.downloadfile", []))
    if (draft := _setup_course(flow)) is not None:
        # The course /setup drafted: done once it is live, which needs every
        # lesson filled in; held for "sell later", once it is ready to go on sale.
        ready = draft.is_published or (_held_course_id(flow) == draft.id and not draft.not_ready())
        add("course_lessons", "content", has_product or ready, href=f"/admin/courses/{draft.slug}")
    elif has_product or _course_expected(tenant, flow):
        add("first_course", "content", has_product)
    if was_seeded:
        add("demo_cleanup", "content", not seeded_rows_exist)
    held = flow.get("held")
    if held:
        # Her own plan, then payouts: what she held goes on sale once she has both (release_held).
        add("start_selling", "business", is_paid_active(tenant))
    # Payouts are setup only for a coach who sells; for one who doesn't they are a nice-to-have.
    add("payouts", "business", can_monetize(tenant), optional=not (held or _has_paid_content(seeded)))
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

        add(
            "first_blog_post",
            "extras",
            _has_own(BlogPost, seeded.get("blog.blogpost", []), queryset=BlogPost.objects.filter(status="published")),
            optional=True,
        )
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
        # The tenant's charge currency: admin price fields/labels must not hardcode "$".
        "currency": tenant_charge_currency(tenant),
        "publish_blockers": publish_blockers(config, tenant),
        # What "sell later" holds, named, for the start-selling card.
        "held": _held_lines(held, flow) if held else [],
    }
