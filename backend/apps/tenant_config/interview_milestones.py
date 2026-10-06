"""Work the interview brief unlocks — page builds, first-content drafts, logo
ranking — each fired exactly once when its facts are settled; plus the look
cards (style, logo) and applying the coach's picks.

Order matters: Home is built first and plans the whole site (site_composer
.plan_site caches the plan); other pages reuse that plan.
ponytail: a page fired while Home's plan call is still running plans again
(one extra AI call); serialize builds if that cost shows up.
"""

import logging

from django.core.cache import cache
from django.db import transaction
from django_tenants.utils import schema_context

from . import interview_brief as brief
from .models import TenantConfig
from .setup_items import _live_entitled

logger = logging.getLogger(__name__)

PAGE_NEEDS = {
    "home": ("teaches", "audience", "outcome", "offers", "pitch"),
    "about": ("teaches", "story", "credentials", "tone"),
    "contact": ("contact", "location"),
    "faq": ("offers", "payments", "course_price", "membership_price", "live_when", "event_price"),
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
DEFAULT_MEMBERSHIP_PRICE = 19


class ChoiceError(Exception):
    """A refused card/chip pick (400) — the message is the machine-readable detail."""


# ── firing ───────────────────────────────────────────────────────────────────


def _due(tenant, answers) -> list[str]:
    offers = set(answers.get("offers") or [])
    if not brief.settled(answers, PAGE_NEEDS["home"]):
        return []
    due = ["style:auto", "page:home", "rank:logos"]
    due += [f"page:{p}" for p in ("about", "contact", "faq") if brief.settled(answers, PAGE_NEEDS[p])]
    # A coach who runs classes gets an Events page once the class section
    # is answered or skipped.
    if offers & {"live", "onsite"} and brief.settled(answers, ("live_topic", "live_when")):
        due.append("page:events")
    skipped = set(answers.get("skipped") or [])
    if "membership" in (answers.get("payments") or []) and brief.settled(answers, ("membership_price",)):
        due.append("plan:membership")
    for kind, needs in DRAFT_NEEDS.items():
        wanted = kind not in skipped and (kind not in DRAFT_OFFERS or offers.intersection(DRAFT_OFFERS[kind]))
        if kind == "event" and wanted and not _live_entitled(tenant):
            wanted = False  # free plan: go-live offers the plan, then this fires
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
        apply_style(tenant, recommended_style(answers.get("niche") or "general"))
    elif action == "page":
        start_page_build(tenant, arg)
    elif action == "rank":
        transaction.on_commit(lambda: tasks.rank_curated_logos.delay(tenant_id))
    elif action == "plan":
        create_membership(tenant, answers)
    elif action == "draft":
        prompt = draft_prompt(answers, arg)
        transaction.on_commit(lambda: tasks.interview_draft_task.delay(tenant_id, arg, prompt))


# Header links the interview adds, in the order they sit in the nav.
NAV = (("/courses", "Courses"), ("/events", "Events"), ("/plans", "Pricing"), ("/about", "About"), ("/faq", "FAQ"))


def sync_site(tenant, answers: dict) -> None:
    """Modules and header links follow what the coach said they offer:
    classes turn on the live module and add an Events link, a membership
    a Pricing link. Additive only, and written only when something changes."""
    from apps.core.onboarding.compose import ALWAYS_MODULES, GOAL_MODULES

    modules = set(ALWAYS_MODULES).union(*(GOAL_MODULES.get(g, ()) for g in answers.get("goals") or []))
    want = {"/events"} if {"live", "onsite"} & set(answers.get("offers") or []) else set()
    if "membership" in (answers.get("payments") or []):
        want.add("/plans")
    order = [href for href, _ in NAV]
    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        if cfg is None:
            return
        nav = dict(cfg.navbar_config or {})
        links = list(nav.get("links") or [])
        hrefs = {link.get("href") for link in links}
        missing = [href for href in order if href in want and href not in hrefs]
        enabled = sorted(set(cfg.enabled_modules or []) | modules)
        if not missing and enabled == sorted(cfg.enabled_modules or []):
            return
        for href in missing:
            before = order[: order.index(href)]
            at = next((i + 1 for i in range(len(links) - 1, -1, -1) if links[i].get("href") in before), 0)
            links.insert(at, {"label": dict(NAV)[href], "href": href})
        cfg.navbar_config = {**nav, "links": links}
        cfg.enabled_modules = enabled
        cfg.save(update_fields=["navbar_config", "enabled_modules"])
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
        return (
            f"My first {where} class. Topic: {_val(answers, 'live_topic', 'you choose')}. "
            f"When: {_val(answers, 'live_when', 'an evening that suits my students')}.{place}"
        )
    return f"My first article. Topic: {_val(answers, 'article_topic', 'you choose something useful for my students')}."


def _set_draft_status(tenant, kind, status) -> None:
    from .setup_flow import _update_flow

    def mutate(_config, flow):
        flow["draft_status"] = {**(flow.get("draft_status") or {}), kind: status}

    _update_flow(tenant, mutate)


def run_draft(tenant, kind: str, prompt: str) -> None:
    """AI draft, else the deterministic fallback. Inside tenant_context."""
    from apps.accounts.models import User
    from apps.core import ai as core_ai
    from apps.core.copilot.content import ContentOpError

    from . import setup_flow

    owner = User.objects.filter(role="owner").order_by("id").first()
    status = "ready"
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
            status = "failed"
    _set_draft_status(tenant, kind, status)
    if kind == "course" and status == "ready":
        grant_membership(tenant)
        setup_flow.start_page_build(tenant, "courses")


def redraft(tenant, answers: dict, kind: str, request: str) -> None:
    """The coach asked for changes on a review screen: draft it again with
    their words (the new draft replaces the old one)."""
    _set_draft_status(tenant, kind, "building")
    prompt = f"{draft_prompt(answers, kind)} Changes the coach asked for: {request[:500]}"
    tenant_id = tenant.id
    from apps.core import tasks

    transaction.on_commit(lambda: tasks.interview_draft_task.delay(tenant_id, kind, prompt))


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


def create_membership(tenant, answers: dict) -> None:
    """The monthly membership a coach asked for: one plan, the first course
    in it. Created once (its id is kept in setup_flow["drafts"]["plan"])."""
    from decimal import Decimal

    from apps.billing.models import SubscriptionPlan

    from .setup_flow import _update_flow, start_page_build

    price = answers.get("membership_price") or DEFAULT_MEMBERSHIP_PRICE
    teaches = str(answers.get("teaches") or "everything I teach")
    plan = SubscriptionPlan.objects.create(
        name="Membership",
        description=f"Every course and class in {teaches.lower()}, one monthly price. Cancel any time.",
        price=Decimal(f"{min(float(price), 9999):.2f}"),
        billing_interval_months=1,
    )

    def mutate(_config, flow):
        flow["drafts"] = {**(flow.get("drafts") or {}), "plan": plan.pk}

    _update_flow(tenant, mutate)
    grant_membership(tenant)
    start_page_build(tenant, "pricing")


def grant_membership(tenant) -> None:
    """Members get the interview's course: the membership's course access
    points at the current course draft."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess
    from apps.courses.models import Course

    drafts = (TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}
    if not drafts.get("plan"):
        return
    course_ct = ContentType.objects.get_for_model(Course)
    SubscriptionPlanAccess.objects.filter(plan_id=drafts["plan"], content_type=course_ct).delete()
    if drafts.get("course") and Course.objects.filter(pk=drafts["course"]).exists():
        SubscriptionPlanAccess.objects.create(
            plan_id=drafts["plan"], content_type=course_ct, object_id=drafts["course"]
        )


# ── look: cards and picks ────────────────────────────────────────────────────


LOOK_PHOTOS = 6


def _look_photos(tenant, answers: dict) -> list[str]:
    """Photos of what the coach teaches for the look previews (a boxing
    coach sees boxing, not the yoga sample photos). Cached for an hour."""
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import allowed_disciplines, on_topic_first

    subject = brief.subject_of(answers)
    if tenant is None or not subject:
        return []
    key = f"setup:look-photos:{tenant.schema_name}:{subject}"
    photos = cache.get(key)
    if photos is None:
        try:
            found = curated_client.search(subject, orientation="landscape", per_page=LOOK_PHOTOS * 2).results
        except curated_client.CuratedImageError:
            found = []
        allowed = allowed_disciplines(subject, str(answers.get("description") or ""))
        photos = [i.preview_url for i in on_topic_first(found, subject, allowed) if i.preview_url][:LOOK_PHOTOS]
        cache.set(key, photos, 3600 if photos else 300)
    return photos


def style_cards(answers: dict, tenant=None) -> dict:
    """Eight looks: every style in its own colours and its first
    alternative, the niche's style first (its own palette is the guide's
    pick); previewed with the coach's own subject and words."""
    from apps.core.onboarding.wizard_catalog import recommended_style

    from . import sections

    first = recommended_style(answers.get("niche") or "general")
    seen: dict[str, int] = {}
    looks = []
    for look in sections.looks():
        seen[look["style"]] = seen.get(look["style"], 0) + 1
        if seen[look["style"]] <= 2:
            looks.append(look)
    looks.sort(key=lambda o: o["style"] != first)
    return {
        "kind": "style",
        "options": [{**o, **({"recommended": True} if o["value"] == first else {})} for o in looks],
        "photos": _look_photos(tenant, answers),
        "headline": str(answers.get("pitch") or "")[:120],
    }


def logo_cards(tenant, answers: dict, page: int = 0) -> dict:
    from apps.core.copilot.logos import mark_of, preview_url
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    by_id = {r.pk: r for r in rows}
    ranked = [by_id[i] for i in (tenant.wizard_state or {}).get("curated_logo_rank") or [] if i in by_id]
    ordered = ranked or shortlist(rows, CoachBrief.from_tenant(tenant), limit=24)
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
                found = curated_client.search(query, orientation="landscape", per_page=COVERS * 3).results
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
    covers to choose from. ``status`` is building | ready | failed, or
    waiting: a class on a plan without live classes is drafted once go-live
    adds them."""
    from apps.core.curated_images.cache import asset_id_from_key
    from apps.core.currency import tenant_charge_currency
    from apps.core.storage import generate_presigned_download_url

    flow = TenantConfig.objects.first().setup_flow or {}
    status = (flow.get("draft_status") or {}).get(kind)
    if status is None and kind == "event" and not _live_entitled(tenant):
        return {"kind": kind, "status": "waiting", "item": None}
    status = status or "building"
    item = None if status == "building" else _draft_row(flow, kind)
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


def cards_for(tenant, answers: dict, field_id: str | None) -> dict | None:
    if field_id == "site_style":
        return style_cards(answers, tenant)
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

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        cfg.style = style_id
        cfg.palette = palette
        cfg.pages = sections.restyle_pages(cfg.pages or {}, style_id)
        cfg.setup_progress = {**(cfg.setup_progress or {}), "look_edited": True}
        cfg.save(update_fields=["style", "palette", "pages", "setup_progress"])
    _bust(tenant)


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
            apply_style(tenant, recommended_style(answers.get("niche") or "general"))
        elif field_id == "site_logo":
            answers["logo"] = {"mode": "wordmark", "curated_id": None}
            apply_logo(tenant, answers)
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
