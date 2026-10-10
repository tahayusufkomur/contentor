"""Work the interview brief unlocks — page builds, first-content drafts, logo
ranking — each fired exactly once when its facts are settled; plus the look
cards (style, logo) and applying the coach's picks.

Order matters: Home is built first and plans the whole site (site_composer
.plan_site caches the plan); other pages reuse that plan.
ponytail: a page fired while Home's plan call is still running plans again
(one extra AI call); serialize builds if that cost shows up.
"""

import json
import logging
import re

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django_tenants.utils import schema_context

from . import interview_brief as brief
from . import interview_schedule as schedule
from . import look_copy
from .models import TenantConfig

logger = logging.getLogger(__name__)

PAGE_NEEDS = {
    "home": ("teaches", "audience", "outcome", "offers", "pitch"),
    "about": ("teaches", "story", "credentials", "tone"),
    "contact": ("contact", "location"),
    "faq": ("offers", "payments", "course_price", "memberships", "live_when", "event_price"),
}
DRAFT_NEEDS = {
    "course": ("course_topic", "payments", "course_price"),
    "event": ("live_topic", "live_when", "payments", "event_price"),
    "post": ("article_topic",),
}
DRAFT_OFFERS = {"event": ("live", "onsite"), "post": ("articles",)}
# The review screen that shows each draft.
REVIEW_FIELDS = {"course_review": "course", "event_review": "event"}
LOGO_PAGE = 15  # + "just my name" = a full 4x4 grid
DEFAULT_TIER = "digital"


class ChoiceError(Exception):
    """A refused card/chip pick (400) — the message is the machine-readable detail."""


# ── firing ───────────────────────────────────────────────────────────────────


def _due(tenant, answers) -> list[str]:
    offers = set(answers.get("offers") or [])
    if not brief.settled(answers, PAGE_NEEDS["home"]):
        return []
    due = ["style:auto", "page:home", "rank:logos"]
    if settings.LOGO_GEN_ENABLED:
        due.append("logo:generate")
    due += [f"page:{p}" for p in ("about", "contact", "faq") if brief.settled(answers, PAGE_NEEDS[p])]
    # A coach who runs classes gets an Events page once the class section
    # is answered or skipped.
    if offers & {"live", "onsite"} and brief.settled(answers, ("live_topic", "live_when")):
        due.append("page:events")
    skipped = set(answers.get("skipped") or [])
    if "membership" in (answers.get("payments") or []) and brief.settled(answers, ("memberships",)):
        due.append("plan:membership")
    for kind, needs in DRAFT_NEEDS.items():
        # A class is drafted on any plan; go-live offers the plan that runs it.
        wanted = kind not in skipped and (kind not in DRAFT_OFFERS or offers.intersection(DRAFT_OFFERS[kind]))
        if wanted and brief.settled(answers, needs):
            due.append(f"draft:{kind}")
    return due


def fire(tenant, answers: dict) -> list[str]:
    """Start every newly-due milestone; returns the keys fired by THIS call.
    The fired set is read and written under the setup_flow row lock, so two
    racing turns can never fire the same milestone twice."""
    from .setup_flow import _update_flow

    sync_site(tenant, answers)
    due = _due(tenant, answers)
    if not due:
        return []
    fired_now: list[str] = []

    def mutate(_config, flow):
        interview = dict(flow.get("interview") or {})
        already = list(interview.get("fired") or [])
        fired_now.extend(k for k in due if k not in already)
        interview["fired"] = already + fired_now
        flow["interview"] = interview
        statuses = dict(flow.get("draft_status") or {})
        for key in fired_now:
            if key.startswith("draft:"):
                statuses[key.removeprefix("draft:")] = "building"
        flow["draft_status"] = statuses

    _update_flow(tenant, mutate)
    for key in fired_now:
        _start(tenant, answers, key)
    return fired_now


def _start(tenant, answers, key) -> None:
    from apps.core import tasks
    from apps.core.onboarding.wizard_catalog import recommended_style

    from .setup_flow import start_page_build

    action, _, arg = key.partition(":")
    tenant_id = tenant.id
    if action == "style" and not brief.is_settled(answers, "site_style"):
        apply_style(tenant, recommended_style(answers.get("niche") or "general", answers.get("tone") or ""))
    elif action == "page":
        start_page_build(tenant, arg)
    elif action == "rank":
        transaction.on_commit(lambda: tasks.rank_curated_logos.delay(tenant_id))
    elif action == "logo":
        from .logo_gen import pipeline

        pipeline.start_batch(tenant)
    elif action == "plan":
        create_memberships(tenant, answers)
    elif action == "draft":
        prompt = draft_prompt(answers, arg)
        transaction.on_commit(lambda: tasks.interview_draft_task.delay(tenant_id, arg, prompt))


# Header links the interview adds, in the order they sit in the nav.
NAV = (
    ("/courses", "Courses"),
    ("/events", "Events"),
    ("/calendar", "Calendar"),
    ("/plans", "Pricing"),
    ("/about", "About"),
    ("/faq", "FAQ"),
)


def sync_site(tenant, answers: dict) -> None:
    """Modules, header links and social accounts follow what the coach said:
    classes turn on the live module and add an Events link (and a Calendar
    link when they want it in the navbar, laid out the way they picked), a
    membership a Pricing link, social accounts header icons. Additive only
    for links, and written only when something changes."""
    from apps.core.onboarding.compose import ALWAYS_MODULES, GOAL_MODULES

    modules = set(ALWAYS_MODULES).union(*(GOAL_MODULES.get(g, ()) for g in answers.get("goals") or []))
    runs_classes = bool({"live", "onsite"} & set(answers.get("offers") or []))
    want = {"/events"} if runs_classes else set()
    if runs_classes and answers.get("calendar_nav") == "yes":
        want.add("/calendar")
    if "membership" in (answers.get("payments") or []):
        want.add("/plans")
    order = [href for href, _ in NAV]
    socials = brief.parse_socials(answers.get("socials"))
    view = answers.get("calendar_view") if answers.get("calendar_view") in CALENDAR_IDS else None
    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        if cfg is None:
            return
        nav = dict(cfg.navbar_config or {})
        links = list(nav.get("links") or [])
        hrefs = {link.get("href") for link in links}
        missing = [href for href in order if href in want and href not in hrefs]
        enabled = sorted(set(cfg.enabled_modules or []) | modules)
        social = {**(cfg.social_links or {}), **socials}
        extra = {
            **({"calendar_view": view} if view else {}),
            **({"show_social": True} if socials else {}),
        }
        if (
            not missing
            and enabled == sorted(cfg.enabled_modules or [])
            and social == (cfg.social_links or {})
            and all(nav.get(k) == v for k, v in extra.items())
        ):
            return
        for href in missing:
            before = order[: order.index(href)]
            at = next((i + 1 for i in range(len(links) - 1, -1, -1) if links[i].get("href") in before), 0)
            links.insert(at, {"label": dict(NAV)[href], "href": href})
        cfg.navbar_config = {**nav, "links": links, **extra}
        cfg.enabled_modules = enabled
        cfg.social_links = social
        cfg.save(update_fields=["navbar_config", "enabled_modules", "social_links"])
    _bust(tenant)


# ── drafts ───────────────────────────────────────────────────────────────────


def _val(answers, field_id, default) -> str:
    if field_id in (answers.get("delegated") or []) or answers.get(field_id) in (None, ""):
        return default
    return str(answers[field_id])


def draft_prompt(answers: dict, kind: str) -> str:
    from .setup_flow import brief_price

    if kind == "course":
        price = brief_price(answers, "course")
        if price == 0:
            price_text = "free" if "membership" not in (answers.get("payments") or []) else "free (in my membership)"
        elif price is None:
            price_text = "a fair price for this niche"
        else:
            price_text = f"{price:g}"
        topic = _val(answers, "course_topic", "you choose a strong first course for my students")
        return (
            f"My first course. Topic: {topic}. Format and length: you choose what suits it. "
            f"For: {_val(answers, 'audience', 'my students')}. Price: {price_text}."
        )
    if kind == "event":
        offers = answers.get("offers") or []
        where = "in person" if "onsite" in offers and "live" not in offers else "online"
        place = f" Where: {answers['location']}." if where == "in person" and answers.get("location") else ""
        first = first_class_at(answers)
        when = f"{_val(answers, 'live_when', 'an evening that suits my students')}" + (
            f" (the first one on {first.strftime('%Y-%m-%dT%H:%M')})" if first else ""
        )
        return f"My first {where} class. Topic: {_val(answers, 'live_topic', 'you choose')}. When: {when}.{place}"
    return f"My first article. Topic: {_val(answers, 'article_topic', 'you choose something useful for my students')}."


def _set_draft_status(tenant, kind, status) -> None:
    from .setup_flow import _update_flow

    def mutate(_config, flow):
        flow["draft_status"] = {**(flow.get("draft_status") or {}), kind: status}

    _update_flow(tenant, mutate)


def run_draft(tenant, kind: str, prompt: str, keep_cover: bool = False) -> None:
    """AI draft, else the deterministic fallback. Inside tenant_context. With
    ``keep_cover`` the new draft takes the cover the old one had. Whatever
    happens, the status ends ready (the draft exists) or failed: a review
    screen never waits on a draft that will not come."""
    from apps.accounts.models import User
    from apps.core import ai as core_ai
    from apps.core.copilot.content import ContentOpError

    from . import setup_flow

    status = "failed"
    try:
        old = _draft_row(TenantConfig.objects.first().setup_flow or {}, kind) if keep_cover else None
        cover = (
            (old.thumbnail, old.thumbnail_url) if old is not None and (old.thumbnail_id or old.thumbnail_url) else None
        )
        owner = User.objects.filter(role="owner").order_by("id").first()
        try:
            # Background priority: the coach's next interview question must not
            # queue behind a draft on the shared hub.
            setup_flow.create_draft(tenant, owner, kind, prompt, label="contentor:compose-draft")
        except (core_ai.AiError, ContentOpError):
            logger.warning("interview draft fell back schema=%s kind=%s", tenant.schema_name, kind, exc_info=True)
            try:
                setup_flow.create_fallback_draft(tenant, owner, kind, brief.answers_of(tenant))
            except ContentOpError:
                logger.exception("interview fallback draft failed schema=%s kind=%s", tenant.schema_name, kind)
                return
        status = "ready"
        if cover is not None:
            item = _draft_row(TenantConfig.objects.first().setup_flow or {}, kind)
            if item is not None:
                item.thumbnail, item.thumbnail_url = cover
                item.save(update_fields=["thumbnail", "thumbnail_url"])
        if kind == "event":
            apply_schedule(tenant)
    finally:
        _set_draft_status(tenant, kind, status)
    if kind == "course":
        grant_membership(tenant)
        setup_flow.start_page_build(tenant, "courses")


# ── class schedule ───────────────────────────────────────────────────────────


def first_class_at(answers: dict):
    """When the coach's schedule puts the first class, or None without one."""
    picked = answers.get("live_schedule")
    if not picked:
        return None
    tz = (TenantConfig.objects.first() or TenantConfig()).timezone
    dates = schedule.occurrences(picked, tz)
    return dates[0] if dates else None


def apply_schedule(tenant) -> None:
    """The drafted class takes the schedule's first date (the model's own
    guess stands when the coach typed a time instead of picking one)."""
    first = first_class_at(brief.answers_of(tenant))
    item = _draft_row(TenantConfig.objects.first().setup_flow or {}, "event") if first else None
    if item is not None and item.scheduled_at != first:
        item.scheduled_at = first
        item.save(update_fields=["scheduled_at"])


def expand_class_series(tenant) -> int:
    """At go-live, a weekly schedule becomes the classes it means: the
    approved first class, copied to every later date (capped by
    interview_schedule.MAX_CLASSES). Returns how many were added."""
    answers = brief.answers_of(tenant)
    picked = answers.get("live_schedule")
    if not picked or picked.get("mode") != "recurring":
        return 0
    flow = TenantConfig.objects.first().setup_flow or {}
    first = _draft_row(flow, "event")
    if first is None or (flow.get("interview") or {}).get("series_expanded"):
        return 0
    tz = TenantConfig.objects.first().timezone
    later = [d for d in schedule.occurrences(picked, tz) if d > first.scheduled_at]
    copy_fields = ("title", "description", "instructor", "status", "pricing_type", "price", "duration_minutes")
    copy_fields += ("thumbnail", "thumbnail_url") + (("location", "address") if hasattr(first, "address") else ())
    model = type(first)
    for when in later:
        row = model(**{f: getattr(first, f) for f in copy_fields}, scheduled_at=when)
        row.save()

    def mutate(_config, flow):
        flow["interview"] = {**(flow.get("interview") or {}), "series_expanded": True}

    from .setup_flow import _update_flow

    _update_flow(tenant, mutate)
    return len(later)


_PHOTO_WORDS = re.compile(r"\b(photos?|pictures?|pics?|images?|covers?|thumbnails?)\b", re.IGNORECASE)
_TEXT_WORDS = re.compile(
    r"\b(text|title|description|wording|words?|copy|names?|lessons?|modules?|curriculum|outline|price|weeks?"
    r"|minutes?|hours?|topic|sentences?|paragraphs?|write|written|intro|tone|length)\b",
    re.IGNORECASE,
)
_WHOLE_WORDS = re.compile(
    r"\b(everything|all of it|start over|from scratch|another version|different version|redo)\b", re.IGNORECASE
)


def redraft_scope(request: str) -> str:
    """What a coach's words on a review screen are about: "photo" (only the
    cover), "words" (the text; the cover stays) or "all" (draft it again)."""
    if _WHOLE_WORDS.search(request) or (_PHOTO_WORDS.search(request) and _TEXT_WORDS.search(request)):
        return "all"
    return "photo" if _PHOTO_WORDS.search(request) else "words"


def redraft(tenant, answers: dict, kind: str, request: str) -> None:
    """The coach asked for changes on a review screen. A photo change swaps the
    cover at once; a words change drafts the words again and keeps the cover;
    anything else drafts it again. The new draft replaces the old one."""
    scope = redraft_scope(request)
    if scope == "photo":
        _next_cover(tenant, kind)
        return
    _set_draft_status(tenant, kind, "building")
    prompt = f"{draft_prompt(answers, kind)} Changes the coach asked for: {request[:500]}"
    tenant_id = tenant.id
    from apps.core import tasks

    keep_cover = scope == "words"
    transaction.on_commit(lambda: tasks.interview_draft_task.delay(tenant_id, kind, prompt, keep_cover))


def _next_cover(tenant, kind: str) -> None:
    """The next catalog photo that fits the draft takes its cover; the words stay."""
    from apps.core.curated_images.cache import asset_id_from_key

    item = _draft_row(TenantConfig.objects.first().setup_flow or {}, kind)
    if item is None:
        return
    current = asset_id_from_key(item.thumbnail.s3_key) if item.thumbnail else ""
    following = next((i for i in _cover_images(tenant, kind, item) if i.asset_id != current), None)
    if following is not None:
        set_cover(tenant, kind, following.asset_id)


def drop_draft(tenant, kind: str) -> None:
    """A skipped section: its draft goes, and its publish blocker with it."""
    from .setup_flow import _delete_draft, _update_flow

    ref = {}

    def mutate(_config, flow):
        drafts = dict(flow.get("drafts") or {})
        ref["old"] = drafts.pop(kind, None)
        flow["drafts"] = drafts
        flow["skipped"] = list(dict.fromkeys([*(flow.get("skipped") or []), kind]))
        flow["draft_status"] = {k: v for k, v in (flow.get("draft_status") or {}).items() if k != kind}

    _update_flow(tenant, mutate)
    _delete_draft(kind, ref.get("old"))


# ── membership ───────────────────────────────────────────────────────────────


def create_memberships(tenant, answers: dict) -> None:
    """The memberships a coach asked for: one plan per picked tier (a
    delegated pick gets the digital one), the first course in every tier
    that includes courses. Created once; the plan ids are kept in
    setup_flow["drafts"]["plans"] by tier."""
    from decimal import Decimal

    from apps.billing.models import SubscriptionPlan

    from .setup_flow import _update_flow, start_page_build

    picked = [i for i in (answers.get("memberships") or []) if i in brief.TIER_BY_ID] or [DEFAULT_TIER]
    teaches = str(answers.get("teaches") or "everything I teach").lower()
    plans = {}
    for tier_id in picked:
        tier = brief.TIER_BY_ID[tier_id]
        perks = ", ".join(p.lower() for p in tier["perks"])
        plans[tier_id] = SubscriptionPlan.objects.create(
            name=tier["label"],
            description=f"{tier['blurb']} {perks[:1].upper()}{perks[1:]}, for {teaches}. Cancel any time.",
            price=Decimal(f"{tier['price']:.2f}"),
            billing_interval_months=1,
        ).pk

    def mutate(_config, flow):
        flow["drafts"] = {**(flow.get("drafts") or {}), "plans": plans, "plan": next(iter(plans.values()))}

    _update_flow(tenant, mutate)
    grant_membership(tenant)
    start_page_build(tenant, "pricing")


def membership_plan_ids(flow: dict) -> list[int]:
    drafts = flow.get("drafts") or {}
    return list((drafts.get("plans") or {}).values()) or ([drafts["plan"]] if drafts.get("plan") else [])


def grant_membership(tenant) -> None:
    """Members get the interview's course: every tier that includes courses
    points its course access at the current course draft."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess
    from apps.courses.models import Course

    drafts = (TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}
    plans = drafts.get("plans") or ({DEFAULT_TIER: drafts["plan"]} if drafts.get("plan") else {})
    if not plans:
        return
    course_ct = ContentType.objects.get_for_model(Course)
    SubscriptionPlanAccess.objects.filter(plan_id__in=plans.values(), content_type=course_ct).delete()
    if not (drafts.get("course") and Course.objects.filter(pk=drafts["course"]).exists()):
        return
    for tier_id, plan_id in plans.items():
        if brief.TIER_BY_ID.get(tier_id, brief.TIER_BY_ID[DEFAULT_TIER])["courses"]:
            SubscriptionPlanAccess.objects.create(plan_id=plan_id, content_type=course_ct, object_id=drafts["course"])


# ── look: cards and picks ────────────────────────────────────────────────────


LOOK_PHOTOS = 6


def _look_photos(tenant, answers: dict) -> list[str]:
    """Photos of what the coach teaches for the look previews (a boxing
    coach sees boxing, not the yoga sample photos). The web rendition, the
    one the real site renders: the previews show a full-width hero, where the
    640 px thumbnail looked soft. Cached for an hour."""
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import allowed_disciplines, on_topic_first

    subject = brief.subject_of(answers)
    if tenant is None or not subject:
        return []
    key = f"setup:look-photos:v2:{tenant.schema_name}:{subject}"
    photos = cache.get(key)
    if photos is None:
        try:
            found = curated_client.search_shaped(subject, "16:9", per_page=LOOK_PHOTOS * 2).results
        except curated_client.CuratedImageError:
            found = []
        allowed = allowed_disciplines(subject, str(answers.get("description") or ""))
        photos = [i.web_url for i in on_topic_first(found, subject, allowed) if i.web_url][:LOOK_PHOTOS]
        cache.set(key, photos, 3600 if photos else 300)
    return photos


def style_cards(answers: dict, tenant=None) -> dict:
    """Every enabled style as one look card, best match first (niche, then the
    tone asked for), each with the colourways it comes in. The first look is
    the guide's pick and carries the reason; the preview shows the coach's own
    subject and words."""
    from . import sections

    niche = answers.get("niche") or "general"
    tones = sections.tones_of(answers.get("tone"))
    ranked = sections.rank_styles(niche, tones)
    rank = {s["id"]: i for i, s in enumerate(ranked)}
    first = ranked[0]["id"] if ranked else ""
    looks = sorted(sections.looks(), key=lambda o: rank[o["style"]])
    reason = style_reason(sections.style(first), niche, tones, answers)
    return {
        "kind": "style",
        "options": [{**o, **({"recommended": True, "reason": reason} if o["value"] == first else {})} for o in looks],
        "photos": _look_photos(tenant, answers),
        "headline": str(answers.get("pitch") or "")[:120],
        # A picked look opens as a whole page: sample copy about their subject,
        # the hero's line in their words.
        "preview": {
            "subject": brief.subject_of(answers),
            "body": hero_line(answers),
            # The sample words written for this coach: every look shows the same set.
            "copy": look_copy.for_tenant(tenant, answers) if tenant is not None else None,
        },
    }


def style_reason(style: dict | None, niche: str, tones: list[str], answers: dict) -> str:
    """Why this look is the pick, in the coach's own words ("Made for dance
    coaches, and it sounds playful")."""
    if not style:
        return ""
    matched = [t for t in tones if t in (style.get("tones") or [])]
    subject = brief.subject_of(answers)
    parts = []
    if niche in (style.get("niches") or []) and subject:
        parts.append(f"made for {subject} coaches")
    if matched:
        parts.append(f"it sounds {' and '.join(matched)}")
    text = ", and ".join(parts)
    return f"{text[:1].upper()}{text[1:]}." if text else ""


def hero_line(answers: dict) -> str:
    """What makes them different, then what students get (the first four)."""
    gets = [g.strip() for g in str(answers.get("outcome") or "").split(",") if g.strip()][:4]
    gets = [g if i == 0 else g[:1].lower() + g[1:] for i, g in enumerate(gets)]
    parts = []
    if answers.get("difference"):
        parts.append(f"{str(answers['difference']).rstrip('.')}.")
    if gets:
        parts.append(f"{', '.join(gets[:-1]) + ' and ' + gets[-1] if len(gets) > 1 else gets[0]}.")
    return " ".join(parts)[:300]


def generated_logos(tenant) -> dict:
    """The current generated batch for the logo card: ready candidates in
    rank order, a building marker, or nothing."""
    from apps.core.storage import generate_presigned_download_url

    from .logo_gen import pipeline
    from .models import LogoCandidate

    batch = pipeline.batch_state(tenant)
    state = batch.get("state")
    if state == "building":
        return {"state": "building", "options": []}
    if state != "ready":
        return {"state": "none", "options": []}
    rows = (
        LogoCandidate.objects.filter(batch=batch.get("id"), state="ready", png__isnull=False)
        .select_related("png")
        .order_by("rank", "position")
    )
    options = [
        {
            "value": f"gen:{r.pk}",
            "label": r.concept[:60],
            "image_url": generate_presigned_download_url(r.png.s3_key),
            "rank": r.rank,
        }
        for r in rows
    ]
    return {"state": "ready" if options else "none", "options": options}


def logo_cards(tenant, answers: dict, page: int = 0) -> dict:
    from apps.core.copilot.logos import mark_of, preview_url
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    by_id = {r.pk: r for r in rows}
    ranked = [by_id[i] for i in (tenant.wizard_state or {}).get("curated_logo_rank") or [] if i in by_id]
    ordered = ranked or shortlist(rows, CoachBrief.from_tenant(tenant), limit=24)
    # Vector marks first: they take the site's colours and crop tight.
    ordered = sorted(ordered, key=lambda r: not r.mark_paths)
    chunk = ordered[page * LOGO_PAGE : (page + 1) * LOGO_PAGE]
    return {
        "kind": "logo",
        "page": page,
        "more": len(ordered) > (page + 1) * LOGO_PAGE,
        "options": [
            {"value": str(r.pk), "label": r.title, "image_url": preview_url(r), "mark": mark_of(r)} for r in chunk
        ],
        # Marks are previewed in the look the coach picked.
        "style": answers.get("style") or "",
        "palette": answers.get("palette") or "",
        "generated": generated_logos(tenant),
    }


COVERS = 4  # the current cover + three others


def _draft_row(flow: dict, kind: str):
    from apps.courses.models import Course
    from apps.live.models import LiveClass, OnsiteEvent

    ref = (flow.get("drafts") or {}).get(kind)
    if not ref:
        return None
    if kind == "course":
        return Course.objects.filter(pk=ref).prefetch_related("modules__lessons").first()
    model = OnsiteEvent if ref.get("kind") == "onsite" else LiveClass
    return model.objects.filter(pk=ref.get("id")).first()


def _cover_images(tenant, kind: str, item) -> list:
    """Catalog photos that could be this draft's cover, cached for an hour
    (the review screen is polled while drafts build)."""
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import CoachBrief, allowed_disciplines, on_topic_first, photo_query

    key = f"setup:covers:{tenant.schema_name}:{kind}:{item.pk}"
    images = cache.get(key)
    if images is None:
        brief = CoachBrief.from_tenant(tenant)
        allowed = allowed_disciplines(brief.subject, brief.description, item.title)
        images = []
        for query in dict.fromkeys((photo_query(brief, item.title), photo_query(brief))):
            try:
                found = curated_client.search_shaped(query, "16:9", per_page=COVERS * 3).results
            except curated_client.CuratedImageError:
                found = []
            images = on_topic_first(found, brief.subject, allowed)
            if images:
                break
        cache.set(key, images, 3600)
    return images


def review_card(tenant, kind: str) -> dict:
    """The review screen of the interview's first course or class: the real
    draft (title, description, curriculum or date, price, cover) and a few
    covers to choose from. ``status`` is building | ready | failed."""
    from apps.core.curated_images.cache import asset_id_from_key
    from apps.core.currency import tenant_charge_currency
    from apps.core.storage import generate_presigned_download_url

    flow = TenantConfig.objects.first().setup_flow or {}
    status = (flow.get("draft_status") or {}).get(kind) or "building"
    # While a redraft runs the draft it replaces stays on the screen, so only what changes moves.
    item = None if status == "failed" else _draft_row(flow, kind)
    card = {"kind": kind, "status": "failed" if status == "ready" and item is None else status, "item": None}
    if item is None:
        return card
    photo = item.thumbnail
    current = asset_id_from_key(photo.s3_key) if photo else ""
    detail = {
        "title": item.title,
        "description": item.description,
        "price": f"{item.price:.2f}" if item.pricing_type == "paid" else "",
        "currency": (getattr(item, "currency", "") or tenant_charge_currency()).upper(),
        "cover_url": generate_presigned_download_url(photo.s3_key) if photo else item.thumbnail_url or "",
    }
    if kind == "course":
        detail["modules"] = [
            {"title": m.title, "lessons": [lesson.title for lesson in m.lessons.all()]} for m in item.modules.all()
        ]
    else:
        ref = (flow.get("drafts") or {}).get("event") or {}
        detail.update(when=item.scheduled_at.isoformat(), event_kind=ref.get("kind", "live"))
        detail["location"] = getattr(item, "location", "") or ""
    others = [i for i in _cover_images(tenant, kind, item) if i.asset_id != current][: COVERS - 1]
    covers = [{"value": current, "url": detail["cover_url"], "current": True}] if detail["cover_url"] else []
    covers += [{"value": i.asset_id, "url": i.preview_url, "current": False} for i in others]
    return {**card, "item": {**detail, "covers": covers}}


def set_cover(tenant, kind: str, asset_id: str) -> dict:
    """The coach picked another cover on a review screen."""
    from apps.core.curated_images import cache as curated_cache
    from apps.core.curated_images.client import CuratedImageError

    flow = TenantConfig.objects.first().setup_flow or {}
    item = _draft_row(flow, kind) if kind in DRAFT_NEEDS else None
    image = next((i for i in _cover_images(tenant, kind, item) if i.asset_id == asset_id), None) if item else None
    if image is None:
        raise ChoiceError("unknown_cover")
    try:
        item.thumbnail = curated_cache.cache_remote_image(image)
    except CuratedImageError:
        raise ChoiceError("cover_unavailable") from None
    item.thumbnail_url = ""
    item.save(update_fields=["thumbnail", "thumbnail_url"])
    return review_card(tenant, kind)


CALENDAR_VIEWS = (
    ("month", "Month grid", "The whole month at a glance, with a day panel."),
    ("agenda", "Agenda list", "Upcoming classes in a simple list, day by day."),
)


CALENDAR_IDS = {v for v, _, _ in CALENDAR_VIEWS}


def calendar_cards() -> dict:
    return {
        "kind": "calendar",
        "options": [{"value": v, "label": label, "detail": detail} for v, label, detail in CALENDAR_VIEWS],
    }


def cards_for(tenant, answers: dict, field_id: str | None) -> dict | None:
    if field_id == "site_style":
        return style_cards(answers, tenant)
    if field_id == "calendar_view":
        return calendar_cards()
    if field_id == "site_logo":
        return logo_cards(tenant, answers)
    if field_id in REVIEW_FIELDS:
        return review_card(tenant, REVIEW_FIELDS[field_id])
    return None


def _bust(tenant) -> None:
    cache.delete(f"tenant:{tenant.schema_name}:config")


def apply_style(tenant, style_id: str, palette: str = "") -> None:
    """Same effect as the copilot's edit_style: every block takes the style's
    layout (no AI), the colourway is set, and the `look` publish blocker clears."""
    from . import sections
    from .logo_gen import pipeline

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        changed = (cfg.style, cfg.palette) != (style_id, palette)
        cfg.style = style_id
        cfg.palette = palette
        cfg.pages = sections.restyle_pages(cfg.pages or {}, style_id)
        cfg.setup_progress = {**(cfg.setup_progress or {}), "look_edited": True}
        cfg.save(update_fields=["style", "palette", "pages", "setup_progress"])
    _bust(tenant)
    # The palette is inside a generated logo: a new look needs a new batch.
    if changed and (tenant.wizard_state or {}).get("logo_batch"):
        pipeline.start_batch(tenant)


def apply_logo(tenant, answers: dict) -> None:
    from apps.core.onboarding.compose import apply_wizard_logo

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        cfg.logo = None  # switching back to a text logo must clear a picked mark
        cfg.logo_url = ""
        apply_wizard_logo(cfg, answers, tenant)
        cfg.save()
    _bust(tenant)


def choose(tenant, answers: dict, field_id: str, value) -> None:
    """A tapped card or chip. Mutates ``answers``; the caller saves them."""
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.wizard_catalog import recommended_style

    from . import sections

    field = brief.FIELD_BY_ID.get(field_id)
    if value == brief.SKIP:
        if field is None or not brief.skip(answers, field.group):
            raise ChoiceError("not_skippable")
        drop_draft(tenant, field.group)
        return
    if field_id in REVIEW_FIELDS:
        if value not in ("ok", brief.DELEGATE):
            raise ChoiceError("invalid_value")
        answers[field_id] = "approved"
        return
    if value == brief.DELEGATE:
        if not brief.delegate(answers, field_id):
            raise ChoiceError("unknown_field")
        if field_id == "site_style":
            apply_style(tenant, recommended_style(answers.get("niche") or "general", answers.get("tone") or ""))
        elif field_id == "site_logo":
            answers["logo"] = {"mode": "wordmark", "curated_id": None}
            apply_logo(tenant, answers)
        return
    if field is not None and field.kind == "schedule":
        picked = schedule.parse(value)
        if picked is None:
            raise ChoiceError("invalid_schedule")
        brief.apply_fact(answers, field_id, schedule.summary(picked))
        answers["live_schedule"] = picked
        # The timezone the coach picked is the site's: class times and the calendar use it.
        config = TenantConfig.objects.first()
        if picked.get("tz") and config and config.timezone != picked["tz"]:
            config.timezone = picked["tz"]
            config.save(update_fields=["timezone"])
            _bust(tenant)
        return
    if field is not None and field.kind == "socials":
        try:
            picked = json.loads(value) if isinstance(value, str) else value
        except ValueError:
            picked = None
        if not isinstance(picked, dict):
            raise ChoiceError("invalid_value")
        links = {n: u for k, v in picked.items() if (n := str(k).lower()) and (u := brief.social_url(n, v))}
        if len(links) < len(picked):  # a handle that doesn't parse is named, never dropped
            raise ChoiceError("invalid_handle")
        answers["socials"] = brief.socials_summary(links)
        return
    if field_id == "calendar_view":
        if value not in CALENDAR_IDS:
            raise ChoiceError("invalid_value")
        answers["calendar_view"] = value
        return
    if field_id == "site_style":
        look = sections.parse_look(value)
        if look is None or look[0] not in sections.enabled_styles():
            raise ChoiceError("unknown_style")
        style_id, palette = look
        answers["site_style"] = str(value)
        answers["style"] = style_id
        answers["palette"] = palette
        apply_style(tenant, style_id, palette)
        return
    if field_id == "site_logo":
        if value == "wordmark":
            logo = {"mode": "wordmark", "curated_id": None}
        elif str(value).startswith("gen:"):
            from .models import LogoCandidate

            try:
                candidate_id = int(str(value)[4:])
            except ValueError:
                raise ChoiceError("unknown_logo") from None
            if not LogoCandidate.objects.filter(pk=candidate_id, state="ready", png__isnull=False).exists():
                raise ChoiceError("unknown_logo")
            logo = {"mode": "generated", "candidate_id": candidate_id}
        else:
            try:
                logo_id = int(value)
            except (TypeError, ValueError):
                raise ChoiceError("unknown_logo") from None
            with schema_context("public"):
                if not CuratedLogo.objects.filter(pk=logo_id, enabled=True).exists():
                    raise ChoiceError("unknown_logo")
            logo = {"mode": "curated", "curated_id": logo_id}
        answers["site_logo"] = str(value)
        answers["logo"] = logo
        apply_logo(tenant, answers)
        return
    if not brief.apply_fact(answers, field_id, value):
        raise ChoiceError("invalid_value")
