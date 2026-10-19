"""Work the interview brief unlocks — page builds, first-content drafts, logo
ranking — each fired exactly once when its facts are settled; plus the look
cards (style, logo) and applying the coach's picks.

Order matters: Home is built first and plans the whole site (site_composer
.plan_site caches the plan); other pages reuse that plan.
ponytail: a page fired while Home's plan call is still running plans again
(one extra AI call); serialize builds if that cost shows up.
"""

import colorsys
import json
import logging
import re
import uuid

from django.core.cache import cache
from django.db import transaction
from django_tenants.utils import schema_context

from . import interview_brief as brief
from . import interview_schedule as schedule
from . import look_copy
from .models import TenantConfig

logger = logging.getLogger(__name__)

PAGE_NEEDS = {
    # "photos": the page is built with her own photos, so it waits for them.
    "home": ("teaches", "photos", "audience", "outcome", "offers", "pitch"),
    "about": ("teaches", "story", "credentials", "tone"),
    "contact": ("contact", "location"),
    "faq": (
        "offers",
        "payments",
        "course_price",
        "memberships",
        "live_when",
        "event_price",
        "onsite_when",
        "onsite_price",
        "course_access",
        "event_access",
        "onsite_access",
    ),
}
DRAFT_NEEDS = {
    "course": ("course_topic", "payments", "course_price"),
    "event": ("live_topic", "live_when", "payments", "event_price"),
    "onsite": ("onsite_topic", "onsite_when", "location", "payments", "onsite_price"),
    "post": ("article_topic",),
}
DRAFT_OFFERS = {"course": ("course",), "event": ("live",), "onsite": ("onsite",), "post": ("articles",)}
# The review screen that shows each draft.
REVIEW_FIELDS = {"course_review": "course", "event_review": "event", "onsite_review": "onsite"}
# Each kind of session keeps its own topic / time / price answers: live_topic, onsite_when, ...
EVENT_KEYS = {"event": "live", "onsite": "onsite"}
LOGO_PAGE = 14  # + "just my name" + "upload my own" = a full 4x4 grid
REMOTE_LOGO = "p4l:"  # a catalog logo mark's card value: p4l:<asset id>
DEFAULT_TIER = "digital"


class ChoiceError(Exception):
    """A refused card/chip pick (400) — the message is the machine-readable detail."""


# ── firing ───────────────────────────────────────────────────────────────────


def _due(tenant, answers) -> list[str]:
    offers = set(answers.get("offers") or [])
    if not brief.settled(answers, PAGE_NEEDS["home"]):
        return []
    due = ["style:auto", "page:home", "rank:logos"]
    due += [f"page:{p}" for p in ("about", "contact", "faq") if brief.settled(answers, PAGE_NEEDS[p])]
    # A coach who runs classes gets an Events page once the class sections
    # are answered or skipped.
    if offers & {"live", "onsite"} and brief.settled(
        answers, ("live_topic", "live_when", "onsite_topic", "onsite_when")
    ):
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
        from apps.core.curated_images import client

        if not client.logos_available():  # the remote catalog ranks its own results
            transaction.on_commit(lambda: tasks.rank_curated_logos.delay(tenant_id))
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
    """Modules, header links, social accounts, the time zone and the currency
    follow what the coach said: classes turn on the live module and add an
    Events link (and a Calendar link when they want it in the navbar, laid out
    the way they picked), a membership a Pricing link, social accounts header
    icons. Additive only for links, and written only when something changes."""
    from apps.core.onboarding.compose import ALWAYS_MODULES, GOAL_MODULES

    modules = set(ALWAYS_MODULES).union(*(GOAL_MODULES.get(g, ()) for g in answers.get("goals") or []))
    runs_classes = bool({"live", "onsite"} & set(answers.get("offers") or []))
    want = {"/events"} if runs_classes else set()
    # Not asked any more: on by default; an earlier interview's "no" still stands.
    if runs_classes and answers.get("calendar_nav") != "no":
        want.add("/calendar")
    if "membership" in (answers.get("payments") or []):
        want.add("/plans")
    order = [href for href, _ in NAV]
    socials = brief.parse_socials(answers.get("socials"))
    view = answers.get("calendar_view") if answers.get("calendar_view") in CALENDAR_IDS else None
    zone = answers.get("timezone")
    apply_currency(tenant, answers.get("currency"))
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
        # The header button provisioning pointed at /courses leads to what
        # the coach offers when that is not courses (one she set stays).
        cta = nav.get("cta") or {}
        offers = set(answers.get("offers") or [])
        retarget = cta.get("href") == "/courses" and offers and "course" not in offers
        extra = {
            **({"calendar_view": view} if view else {}),
            **({"show_social": True} if socials else {}),
            **({"cta": {**cta, "href": "/events" if runs_classes else "/about"}} if retarget else {}),
        }
        rezone = bool(zone) and cfg.timezone != zone
        if (
            not missing
            and not rezone
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
        cfg.timezone = zone or cfg.timezone
        cfg.save(update_fields=["navbar_config", "enabled_modules", "social_links", "timezone"])
    _bust(tenant)
    if rezone:
        apply_schedule(tenant)  # a class already drafted keeps its hour in the new zone


def apply_currency(tenant, code) -> bool:
    """The currency the coach picked becomes the one she charges in, and the
    memberships already set up follow. Only while no money has moved in the
    old one: once she has bought a plan or a student has paid, it stays. Every
    other write of Tenant.billing_currency is refused by its pre_save guard;
    this is the one door past it."""
    from django.db import connection

    from apps.billing.models import Bundle, Payment, Subscription, SubscriptionPlan
    from apps.core.constants import CURRENCY_CHOICES
    from apps.core.models import PlatformSubscription, Tenant

    if code not in dict(CURRENCY_CHOICES) or code == tenant.billing_currency:
        return False
    bought = PlatformSubscription.objects.filter(
        tenant=tenant,
        provider=PlatformSubscription.PROVIDER_STRIPE,
        status=PlatformSubscription.STATUS_ACTIVE,
    )
    if bought.exists() or Payment.objects.exists() or Subscription.objects.exists():
        return False
    Tenant.objects.filter(pk=tenant.pk).update(billing_currency=code)
    for known in (tenant, getattr(connection, "tenant", None)):
        if getattr(known, "pk", None) == tenant.pk:
            known.billing_currency = code
    # A Stripe price made in the old currency is never reused.
    SubscriptionPlan.objects.update(
        currency=code, stripe_price_id="", stripe_price_amount_cents=0, stripe_price_interval_months=0
    )
    Bundle.objects.update(currency=code)
    _bust(tenant)
    return True


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
    if kind in ("event", "onsite"):
        key = EVENT_KEYS[kind]
        place = f" Where: {answers['location']}." if kind == "onsite" and answers.get("location") else ""
        first = first_class_at(answers, kind)
        when = f"{_val(answers, f'{key}_when', 'an evening that suits my students')}" + (
            f" (the first one on {first.strftime('%Y-%m-%dT%H:%M')})" if first else ""
        )
        what = "in person event" if kind == "onsite" else "online class"
        return f"My first {what}. Topic: {_val(answers, f'{key}_topic', 'you choose')}. When: {when}.{place}"
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
        if kind in EVENT_KEYS:
            apply_schedule(tenant)
        apply_access(tenant)
    finally:
        _set_draft_status(tenant, kind, status)
    if kind == "course":
        setup_flow.start_page_build(tenant, "courses")


# ── class schedule ───────────────────────────────────────────────────────────


def first_class_at(answers: dict, kind: str = "event"):
    """When the coach's schedule puts the first class of this kind (the online
    class "event" or the in-person "onsite"), or None without one."""
    picked = answers.get(f"{EVENT_KEYS[kind]}_schedule")
    if not picked:
        return None
    tz = (TenantConfig.objects.first() or TenantConfig()).timezone
    dates = schedule.occurrences(picked, tz)
    return dates[0] if dates else None


def apply_schedule(tenant) -> None:
    """Each drafted class takes its schedule's first date (the model's own
    guess stands when the coach typed a time instead of picking one)."""
    answers = brief.answers_of(tenant)
    flow = TenantConfig.objects.first().setup_flow or {}
    for kind in EVENT_KEYS:
        first = first_class_at(answers, kind)
        item = _draft_row(flow, kind) if first else None
        if item is not None and item.scheduled_at != first:
            item.scheduled_at = first
            item.save(update_fields=["scheduled_at"])


def apply_address(answers: dict) -> None:
    """An in-person event already drafted moves with its address (she went back)."""
    row = _draft_row(TenantConfig.objects.first().setup_flow or {}, "onsite")
    if row is not None:
        row.location, row.address = answers.get("location") or "", answers.get("address") or ""
        row.save(update_fields=["location", "address"])


def expand_class_series(tenant, kind: str = "event") -> int:
    """At go-live, a weekly schedule becomes the sessions it means: the
    approved first one, copied to every later date (capped by
    interview_schedule.MAX_CLASSES). ``kind`` is the online class "event" or the
    in-person "onsite". Returns how many were added."""
    answers = brief.answers_of(tenant)
    picked = answers.get(f"{EVENT_KEYS[kind]}_schedule")
    if not picked or picked.get("mode") != "recurring":
        return 0
    flow = TenantConfig.objects.first().setup_flow or {}
    first = _draft_row(flow, kind)
    flag = "series_expanded" if kind == "event" else f"series_expanded_{kind}"  # "event" keeps its first name
    if first is None or (flow.get("interview") or {}).get(flag):
        return 0
    from apps.live import series

    added = series.expand(first, picked, TenantConfig.objects.first().timezone)

    def mutate(_config, flow):
        flow["interview"] = {**(flow.get("interview") or {}), flag: True}

    from .setup_flow import _update_flow

    _update_flow(tenant, mutate)
    return added


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

    ref = None

    def mutate(_config, flow):
        nonlocal ref
        drafts = dict(flow.get("drafts") or {})
        ref = drafts.pop(kind, None)
        flow["drafts"] = drafts
        flow["skipped"] = list(dict.fromkeys([*(flow.get("skipped") or []), kind]))
        flow["draft_status"] = {k: v for k, v in (flow.get("draft_status") or {}).items() if k != kind}

    _update_flow(tenant, mutate)
    _delete_draft(kind, ref)


# ── membership ───────────────────────────────────────────────────────────────


def sync_memberships(tenant, answers: dict) -> None:
    """One plan per membership the coach offers (a delegated pick gets the
    first her offers allow); a tier's perks promise only what she offers, and
    one of her own is its name. Safe to run again when she goes back: a
    membership added since gets its plan, a price changed is followed, and one
    she dropped loses its plan unless a student already subscribed to it. The
    plan ids are kept in setup_flow["drafts"]["plans"] by membership."""
    from decimal import Decimal

    from apps.billing.models import SubscriptionPlan

    from .setup_flow import _update_flow

    picked = brief.memberships_of(answers)
    made = dict(((TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}).get("plans") or {})
    teaches = str(answers.get("teaches") or "everything I teach").lower()
    plans = {}
    for m in picked:
        price = Decimal(f"{brief.tier_price(answers, m['id']):.2f}")
        pk = made.pop(m["id"], None)
        if pk and SubscriptionPlan.objects.filter(pk=pk).update(price=price):
            plans[m["id"]] = pk
            continue
        perks = ", ".join(p.lower() for p in m["perks"])
        about = f"{m['blurb']} {perks[:1].upper()}{perks[1:]}, for {teaches}." if perks else m["blurb"]
        plans[m["id"]] = SubscriptionPlan.objects.create(
            name=m["label"][:100], description=f"{about} Cancel any time.", price=price, billing_interval_months=1
        ).pk
    SubscriptionPlan.objects.filter(pk__in=made.values(), subscriptions__isnull=True).delete()

    def mutate(_config, flow):
        flow["drafts"] = {**(flow.get("drafts") or {}), "plans": plans, "plan": next(iter(plans.values()), None)}

    _update_flow(tenant, mutate)
    apply_access(tenant, answers)


def create_memberships(tenant, answers: dict) -> None:
    """The memberships a coach asked for, and the Pricing page that sells them."""
    from .setup_flow import start_page_build

    sync_memberships(tenant, answers)
    start_page_build(tenant, "pricing")


def membership_plan_ids(flow: dict) -> list[int]:
    drafts = flow.get("drafts") or {}
    return list((drafts.get("plans") or {}).values()) or ([drafts["plan"]] if drafts.get("plan") else [])


def apply_access(tenant, answers: dict | None = None) -> None:
    """Each drafted course or class takes the ways in the coach chose for it
    (brief.access_of: her answer, else what a "pick for me" gets): a place in
    every membership that includes it, and its price. Sold on its own it is
    paid; open to members only it is "subscription"; else it is free. Only for
    a coach with memberships: without them a draft's price is all there is."""
    from decimal import Decimal

    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess

    from .setup_flow import brief_price

    answers = brief.answers_of(tenant) if answers is None else answers
    flow = TenantConfig.objects.first().setup_flow or {}
    drafts = flow.get("drafts") or {}
    plans = drafts.get("plans") or ({DEFAULT_TIER: drafts["plan"]} if drafts.get("plan") else {})
    if not plans or not brief.memberships_of(answers):
        return
    for kind, (_, _, way, price_key, _) in brief.ACCESS.items():
        row = _draft_row(flow, kind)
        if row is None:
            continue
        ways = brief.access_of(answers, kind)
        want = {plans[w] for w in ways if w in plans}
        links = SubscriptionPlanAccess.objects.filter(
            plan_id__in=plans.values(), content_type=ContentType.objects.get_for_model(type(row)), object_id=row.pk
        )
        links.exclude(plan_id__in=want).delete()
        for plan_id in want - set(links.values_list("plan_id", flat=True)):
            SubscriptionPlanAccess.objects.get_or_create(
                plan_id=plan_id, content_type=ContentType.objects.get_for_model(type(row)), object_id=row.pk
            )
        price = Decimal(f"{brief_price(answers, way, price_key) or 0:.2f}") if brief.BUY in ways else Decimal("0")
        pricing = "paid" if price else "subscription" if want else "free"
        if (row.pricing_type, row.price) != (pricing, price):
            type(row).objects.filter(pk=row.pk).update(pricing_type=pricing, price=price)


# ── look: cards and picks ────────────────────────────────────────────────────


LOOK_PHOTOS = 6


def _look_photos(tenant, answers: dict) -> list[str]:
    """Photos of what the coach teaches for the look previews (a boxing
    coach sees boxing, not the yoga sample photos). The web rendition, the
    one the real site renders: the previews show a full-width hero, where the
    640 px thumbnail looked soft. The catalog's are cached for an hour."""
    subject = brief.subject_of(answers)
    if tenant is None:
        return []
    # Her own wide photos first: the looks are previewed with the site's real pictures.
    own = _own_look_photos(answers, subject)
    if len(own) >= LOOK_PHOTOS or not subject:
        return own[:LOOK_PHOTOS]
    return [*own, *_catalog_look_photos(tenant, answers, subject)][:LOOK_PHOTOS]


def _own_look_photos(answers: dict, subject: str) -> list[str]:
    from apps.media import own_photos

    if answers.get("photos") != brief.OWN_PHOTOS:
        return []
    wide = [
        i for i in own_photos.search(subject, aspect="16:9", limit=LOOK_PHOTOS * 2) if (i.width or 0) > (i.height or 0)
    ]
    return [i.web_url for i in wide][:LOOK_PHOTOS]


def _catalog_look_photos(tenant, answers: dict, subject: str) -> list[str]:
    from apps.core.curated_images import client as curated_client
    from apps.core.onboarding.ai_curate import allowed_disciplines, on_topic_first

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
    from . import sections

    if not style:
        return ""
    matched = [t for t in tones if t in sections.tones_of_style(style)]
    subject = brief.subject_of(answers)
    parts = []
    if niche in (style.get("niches") or []) and subject:
        parts.append(f"made for {subject} creators")
    if matched:
        parts.append(f"it sounds {' and '.join(matched)}")
    text = ", and ".join(parts)
    return f"{text[:1].upper()}{text[1:]}." if text else ""


def _lower_after_commas(text: str) -> str:
    """Tiles joined mid-sentence read as one: "breaks, Anatomy-focused" becomes
    "breaks, anatomy-focused" (an acronym like "AI" keeps its capitals)."""
    return re.sub(r"(, )([A-Z])(?=[a-z])", lambda m: m[1] + m[2].lower(), text)


def hero_line(answers: dict) -> str:
    """What makes them different, then what students get (the first four)."""
    gets = [g.strip() for g in str(answers.get("outcome") or "").split(",") if g.strip()][:4]
    gets = [g if i == 0 else g[:1].lower() + g[1:] for i, g in enumerate(gets)]
    parts = []
    if answers.get("difference"):
        parts.append(f"{_lower_after_commas(str(answers['difference']).rstrip('.'))}.")
    if gets:
        parts.append(f"{', '.join(gets[:-1]) + ' and ' + gets[-1] if len(gets) > 1 else gets[0]}.")
    return " ".join(parts)[:300]


def _tint_gain(colors) -> float | None:
    """How far a flat mark's ink is amplified when its card redraws it in the
    look's colour. The card's filter turns ink darkness into coverage, so the
    darkest ink must reach full strength: 1 for black, more for a lighter ink.
    None keeps the mark's own colours: a painted one (more than three inks
    of different hues), or one too pale to carry a colour."""
    try:
        inks = [tuple(int(c[i : i + 2], 16) / 255 for i in (1, 3, 5)) for c in colors]
    except ValueError:
        return None
    if not inks or (len(inks) > 3 and not _one_hue(inks)):
        return None
    darkest = min(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in inks)
    return round(1 / (1 - darkest), 2) if darkest < 0.75 else None


def _one_hue(inks) -> bool:
    """Whether the inks are shades of one colour: every chromatic one sits
    within a sixth of the colour wheel (greys and blacks go with anything)."""
    hues = sorted(colorsys.rgb_to_hls(*ink)[0] for ink in inks if max(ink) - min(ink) > 0.12)
    if len(hues) < 2:
        return True
    widest_gap = max((hues[(i + 1) % len(hues)] - hue) % 1 for i, hue in enumerate(hues))
    return 1 - widest_gap <= 1 / 6


def _remote_logo_options(answers: dict, page: int) -> tuple[list[dict], bool] | None:
    """One card page of catalog logo marks for what this coach teaches, and
    whether more follow; None when the catalog cannot be reached (the cards
    fall back to the local library). The catalog ranks them, so nothing is
    ranked here."""
    from apps.core.curated_images import client

    start, per = page * LOGO_PAGE, client.MAX_PER_PAGE
    try:
        query = client.logo_query(brief.subject_of(answers))
        marks, more = [], True
        # The catalog serves 12 a page; a card page is 14.
        for upstream in range(start // per + 1, (start + LOGO_PAGE - 1) // per + 2):
            found = client.search(query, kind=client.LOGO, page=upstream)
            marks += found.results
            more = found.has_next
            if not more:
                break
    except client.CuratedImageError:
        return None
    offset = start % per
    return [
        {
            "value": f"{REMOTE_LOGO}{m.asset_id}",
            "label": m.title,
            "image_url": m.preview_url,
            "mark": None,
            # A flat mark of a few inks is drawn in the look's colour, as a
            # traced mark is; a painted one keeps its own colours.
            "tint": _tint_gain(m.colors),
        }
        for m in marks[offset : offset + LOGO_PAGE]
    ], more or len(marks) > offset + LOGO_PAGE


def logo_cards(tenant, answers: dict, page: int = 0) -> dict:
    from apps.core.copilot.logos import mark_of, preview_url
    from apps.core.curated_images import client
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    remote = _remote_logo_options(answers, page) if client.logos_available() else None
    if remote is not None:
        options, more = remote
    else:
        with schema_context("public"):
            rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
        by_id = {r.pk: r for r in rows}
        ranked = [by_id[i] for i in (tenant.wizard_state or {}).get("curated_logo_rank") or [] if i in by_id]
        ordered = ranked or shortlist(rows, CoachBrief.from_tenant(tenant), limit=24)
        # Vector marks first: they take the site's colours and crop tight.
        ordered = sorted(ordered, key=lambda r: not r.mark_paths)
        more = len(ordered) > (page + 1) * LOGO_PAGE
        options = [
            {"value": str(r.pk), "label": r.title, "image_url": preview_url(r), "mark": mark_of(r)}
            for r in ordered[page * LOGO_PAGE : (page + 1) * LOGO_PAGE]
        ]
    return {
        "kind": "logo",
        "page": page,
        "more": more,
        "options": options,
        # Marks are previewed in the look the coach picked, beside her name.
        "brand": tenant.name or "",
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


def _plans_including(item) -> list:
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlan

    ct = ContentType.objects.get_for_model(type(item))
    return list(SubscriptionPlan.objects.filter(access_items__content_type=ct, access_items__object_id=item.pk))


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


def _stable_cover_url(s3_key: str) -> str:
    """The review screen polls every few seconds and a fresh signature changes
    the src each time (the cover reloads and replays its animation), so one
    signed URL is reused for half of its hour."""
    from apps.core.storage import generate_presigned_download_url

    key = f"review-cover:{s3_key}"
    url = cache.get(key)
    if url is None:
        url = generate_presigned_download_url(s3_key)
        cache.set(key, url, 1800)
    return url


def review_card(tenant, kind: str) -> dict:
    """The review screen of the interview's first course or class: the real
    draft (title, description, curriculum or date, price, cover) and a few
    covers to choose from. ``status`` is building | ready | failed."""
    from apps.core.curated_images.cache import asset_id_from_key
    from apps.core.currency import tenant_charge_currency

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
        # Who can open it besides a buyer: the memberships that include it.
        "members": [p.name for p in _plans_including(item)],
        "currency": (getattr(item, "currency", "") or tenant_charge_currency()).upper(),
        "cover_url": _stable_cover_url(photo.s3_key) if photo else item.thumbnail_url or "",
    }
    if kind == "course":
        detail["modules"] = [
            {"title": m.title, "lessons": [lesson.title for lesson in m.lessons.all()]} for m in item.modules.all()
        ]
    else:
        ref = (flow.get("drafts") or {}).get(kind) or {}
        detail.update(when=item.scheduled_at.isoformat(), event_kind=ref.get("kind", "live"))
        detail["location"] = getattr(item, "location", "") or ""
        detail["address"] = getattr(item, "address", "") or ""
        # A weekly class says so, not only its first date (audit G6).
        picked = brief.answers_of(tenant).get(f"{EVENT_KEYS[kind]}_schedule")
        if isinstance(picked, dict) and picked.get("mode") == "recurring":
            detail["repeats"] = schedule.summary(picked)
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


# What the photos question asks for, in the shapes the site's sections crop to.
PHOTO_SHOTS = {
    "portrait": (
        "Upright",
        "4:5",
        "Most of your site: the opening photo, your story, the photo wall.",
        "You at work or practising, a portrait where we see your face, your students, your space.",
    ),
    "landscape": (
        "Wide",
        "16:9",
        "Banners between sections, and the covers of your courses and classes.",
        "A wide view of a class or your space, with room around the subject.",
    ),
    "square": ("Square", "1:1", "Small accents beside the opening photo.", "A detail: hands, tools, a close-up."),
}
MAX_OWN_PHOTOS = 40


def photo_guide() -> list[dict]:
    """How many photos of each shape a home page shows, counted from the
    section recipes (so it stays true when they change), with what each shape
    is used for. The most used shape first."""
    from apps.core.curated_images.client import orientation_of

    from . import sections

    counts = dict.fromkeys(PHOTO_SHOTS, 0)
    for entry in sections.manifest().get("recipes", {}).get("home", ()):
        family = entry.split(":")[0]
        fields = (sections.families().get(family) or {}).get("fields") or {}
        slots = [(n, s.get("aspect", "1:1"), 1) for n, s in fields.items() if s.get("type") == "image"]
        slots += [
            (n, sub.get("aspect", "1:1"), int(s.get("max") or 1))
            for n, s in fields.items()
            if s.get("type") == "items"
            for sub in s["fields"].values()
            if sub.get("type") == "image"
        ]
        if family == "hero":
            slots = slots[:2]  # most looks open with one or two photos
        for _name, aspect, many in slots:
            counts[orientation_of(aspect)] += many
    return [
        {"shape": shape, "label": label, "aspect": aspect, "count": counts[shape], "use": use, "shoot": shoot}
        for shape, (label, aspect, use, shoot) in sorted(PHOTO_SHOTS.items(), key=lambda kv: -counts[kv[0]])
    ]


def photo_cards() -> dict:
    """The photos question: what to bring, and what she has uploaded so far."""
    from apps.core.storage import generate_presigned_download_url
    from apps.media import own_photos

    return {
        "kind": "photos",
        "guide": photo_guide(),
        "max": MAX_OWN_PHOTOS,
        "photos": [
            {
                "id": str(p.pk),
                "url": generate_presigned_download_url(p.s3_key),
                "title": p.title,
                "width": p.width,
                "height": p.height,
                "status": p.index_status,
            }
            for p in own_photos.own_photos().order_by("created_at")[:MAX_OWN_PHOTOS]
        ],
    }


def cards_for(tenant, answers: dict, field_id: str | None) -> dict | None:
    if field_id == "photos":
        return photo_cards()
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
        # Switching logos clears the last one's parts: a picked mark's
        # favicon and recipe.
        cfg.logo = cfg.icon = None
        cfg.logo_url = cfg.icon_url = ""
        cfg.logo_recipe = {}
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
    if field_id == "photos":
        from apps.media import own_photos

        # "own" only once a photo of hers is there; anything else leaves the photos to the guide.
        if value == brief.OWN_PHOTOS and not own_photos.has_any():
            raise ChoiceError("no_photos")
        answers["photos"] = brief.OWN_PHOTOS if value == brief.OWN_PHOTOS else brief.STOCK_PHOTOS
        return
    if value == brief.DELEGATE:
        if not brief.delegate(answers, field_id):
            raise ChoiceError("unknown_field")
        if field_id == "site_style":
            apply_style(tenant, recommended_style(answers.get("niche") or "general", answers.get("tone") or ""))
        elif field_id == "site_logo":
            answers["logo"] = {"mode": "wordmark", "curated_id": None}
            apply_logo(tenant, answers)
        elif field_id == "calendar_view":
            answers["calendar_view"] = "month"
        return
    if field is not None and field.kind == "schedule":
        picked = schedule.parse(value)
        if picked is None:
            raise ChoiceError("invalid_schedule")
        brief.apply_fact(answers, field_id, schedule.summary(picked))
        # Class times are in the site's time zone, which has its own question.
        answers[f"{field_id.removesuffix('_when')}_schedule"] = {k: v for k, v in picked.items() if k != "tz"}
        return
    if field is not None and field.kind == "address":
        # The place and its street address: {"Place": "Studio 4", "Address": "Hauptstr. 12, Berlin"}.
        try:
            picked = json.loads(value) if isinstance(value, str) else value
        except ValueError:
            picked = None
        picked = picked if isinstance(picked, dict) else {}
        place = str(picked.get("Place") or "").strip()[: brief.TEXT_MAX]
        street = str(picked.get("Address") or "").strip()[: brief.TEXT_MAX]
        if not place or not street:
            raise ChoiceError("invalid_address")
        answers["location"], answers["address"] = place, street
        answers["delegated"] = [d for d in answers.get("delegated") or [] if d != "location"]
        apply_address(answers)
        return
    if field is not None and field.kind == "contact" and isinstance(value, str) and value.lstrip().startswith("{"):
        # Picked ways with their details: {"Email": "...", "WhatsApp": "...", "Contact form": ""}.
        try:
            picked = json.loads(value)
        except ValueError:
            raise ChoiceError("invalid_value") from None
        if not isinstance(picked, dict) or not picked:
            raise ChoiceError("invalid_value")
        parts = []
        for way in field.options:
            if way not in picked:
                continue
            detail = str(picked[way] or "").strip()
            kind = brief.CONTACT_DETAILS.get(way)
            if kind and not brief.contact_detail_ok(kind, detail):
                raise ChoiceError(f"invalid_{kind}")
            parts.append(f"{way}: {detail}" if kind else way)
        if not parts:
            raise ChoiceError("invalid_value")
        answers["contact"] = "; ".join(parts)
        answers["delegated"] = [d for d in answers.get("delegated") or [] if d != "contact"]
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
    if field is not None and field.kind == "memberships" and isinstance(value, str) and value.lstrip().startswith("{"):
        # Ticked tiers with her monthly price for each: {"Digital membership": 12}.
        try:
            picked = json.loads(value)
        except ValueError:
            raise ChoiceError("invalid_value") from None
        if not isinstance(picked, dict) or not picked or len(picked) > brief.MAX_MEMBERSHIPS:
            raise ChoiceError("invalid_value")
        # A label that is no tile is a membership of her own: its name is its key.
        known = {t["label"]: t["id"] for t in brief.membership_tiles(answers)}
        prices = {}
        for label, raw in picked.items():
            name = re.sub(r"\s+", " ", str(label)).strip()
            if not 2 <= len(name) <= brief.MEMBERSHIP_NAME_MAX or name.lower() in ("buy", "free"):
                raise ChoiceError("invalid_value")
            price = brief.parse_price(str(raw))
            if not price or price <= 0:
                raise ChoiceError("invalid_price")
            prices[known.get(name, name)] = round(price, 2)
        order = list(known.values())
        answers["memberships"] = sorted(prices, key=lambda k: order.index(k) if k in order else len(order))
        answers["membership_prices"] = {**(answers.get("membership_prices") or {}), **prices}
        answers["delegated"] = [d for d in answers.get("delegated") or [] if d != "memberships"]
        if ((TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}).get("plans"):
            sync_memberships(tenant, answers)  # she went back: the plans follow
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
        elif str(value).startswith("upload:"):
            from apps.media.models import Photo

            try:
                photo_id = str(uuid.UUID(str(value)[7:]))
            except ValueError:
                raise ChoiceError("unknown_logo") from None
            if not Photo.objects.filter(pk=photo_id).exists():
                raise ChoiceError("unknown_logo")
            logo = {"mode": "upload", "photo_id": photo_id}
        elif str(value).startswith(REMOTE_LOGO):
            from apps.core.curated_images.cache import cached_asset

            try:
                asset_id = str(uuid.UUID(str(value)[len(REMOTE_LOGO) :]))
            except ValueError:
                raise ChoiceError("unknown_logo") from None
            # Copied into her storage now: a mark the catalog cannot hand
            # over is refused here, not silently swapped for her name.
            if cached_asset(asset_id) is None:
                raise ChoiceError("unknown_logo")
            logo = {"mode": "curated", "asset_id": asset_id}
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
