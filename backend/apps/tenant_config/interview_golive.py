"""Go-live for the /setup interview: what still stands between the coach and
a published site (a paid plan and Stripe only when they sell), publishing,
and two ways out: "go live now, sell later" (paid items held) and "make it
free"."""

import logging
from contextlib import suppress

from apps.core.monetization import can_monetize, is_paid_active

from . import interview_brief as brief
from .interview_milestones import drop_draft, expand_class_series, fire, membership_plan_ids
from .models import TenantConfig
from .setup_items import _has_paid_content, _live_entitled, _seeded_by_label, publish_blockers

logger = logging.getLogger(__name__)


def _starter_plan(tenant) -> dict | None:
    from apps.billing.views.platform import _build_prices
    from apps.core.models import PlatformPlan

    plan = PlatformPlan.objects.filter(is_active=True, price_monthly__gt=0).order_by("price_monthly").first()
    if plan is None:
        return None
    currency = (tenant.billing_currency or "USD").upper()
    entry = _build_prices(plan).get(currency) or {}
    return {"id": plan.pk, "name": plan.name, "amount_cents": entry.get("amount_cents"), "currency": currency}


# The choices that need a paid plan, by question: classes need it to run,
# and selling needs it at all.
PLAN_CHOICES = {
    "offers": ("Live online classes", "In-person sessions"),
    "payments": ("One-time course purchases", "Monthly membership", "Pay per class or event"),
}


def plan_badge(tenant, field_id) -> dict | None:
    """The plan a question's paid choices need, shown on those tiles before
    the coach picks (it used to appear first at go-live). None once they
    have it."""
    labels = PLAN_CHOICES.get(field_id or "")
    if not labels:
        return None
    covered = _live_entitled(tenant) if field_id == "offers" else is_paid_active(tenant)
    plan = None if covered else _starter_plan(tenant)
    return {**plan, "options": list(labels)} if plan else None


def golive_state(tenant) -> dict:
    answers = brief.answers_of(tenant)
    fire(tenant, answers)  # e.g. a live-class draft unlocked by a plan bought at checkout
    config = TenantConfig.objects.first()
    flow = config.setup_flow or {}
    fired = (flow.get("interview") or {}).get("fired") or []
    builds = flow.get("page_builds") or {}
    building = any(
        (builds.get(k.removeprefix("page:")) or {}).get("status") == "building" for k in fired if k.startswith("page:")
    ) or any(s == "building" for s in (flow.get("draft_status") or {}).values())
    held = flow.get("held")
    paid_content = _has_paid_content(_seeded_by_label(), held=held)
    wants_live = bool({"live", "onsite"} & set(answers.get("offers") or [])) and not _live_entitled(tenant)
    paid = is_paid_active(tenant)
    # Selling is known from the brief even before a paid course exists; a
    # coach who chose to sell later goes live first.
    sells = (paid_content or answers.get("sells") == "paid") and held is None
    wants_live = wants_live and held is None
    needs_plan = (sells or wants_live) and not paid
    needs_payouts = paid_content and paid and not can_monetize(tenant)
    # Every step left, with its time, shown at once (it used to appear one card at a time).
    steps = [
        *(
            [{"id": "plan", "label": "Choose a plan", "minutes": 2, "done": not needs_plan}]
            if sells or wants_live
            else []
        ),
        *(
            [
                {
                    "id": "payouts",
                    "label": "Connect payouts with Stripe",
                    "minutes": 5,
                    "done": paid and not needs_payouts,
                }
            ]
            if sells
            else []
        ),
        {"id": "publish", "label": "Go live", "minutes": 1, "done": False},
    ]
    return {
        "ready": not brief.missing(answers) and not building,
        "building": building,
        "needs_plan": needs_plan,
        "needs_payouts": needs_payouts,
        "plan": _starter_plan(tenant) if needs_plan else None,
        "blockers": _open_blockers(config, tenant, flow),
        "steps": steps,
        "summary": _summary(tenant, answers, flow),
        # What "make it free" would change, said before the coach agrees to it.
        "free_effects": _free_effects(tenant, answers, flow) if needs_plan or needs_payouts else [],
        # What waits, with its prices, until she can take payments.
        "held": _held_lines(held or {}),
    }


_PAGE_LABELS = {
    "home": "Home",
    "about": "About",
    "courses": "Courses",
    "events": "Events",
    "pricing": "Pricing",
    "faq": "FAQ",
    "contact": "Contact",
}


def _money(amount, tenant) -> str:
    from apps.core.currency import tenant_charge_currency

    return f"{amount:.2f}".removesuffix(".00") + f" {tenant_charge_currency(tenant).upper()}"


def _summary(tenant, answers, flow) -> list[dict]:
    """What the interview built, in one place before going live."""
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    lines = []
    builds = flow.get("page_builds") or {}
    if pages := [label for key, label in _PAGE_LABELS.items() if key in builds]:
        lines.append({"label": "Pages", "value": ", ".join(pages)})
    drafts = flow.get("drafts") or {}
    course = Course.objects.filter(pk=drafts["course"]).first() if drafts.get("course") else None
    if course:
        price = _money(course.price, tenant) if course.pricing_type == "paid" else "free"
        lines.append({"label": "First course", "value": f"{course.title} ({price})"})
    plans = SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow), is_active=True)
    if plans:
        value = ", ".join(f"{p.name} ({_money(p.price, tenant)} a month)" for p in plans)
        lines.append({"label": "Memberships", "value": value})
    if {"live", "onsite"} & set(answers.get("offers") or []) and brief.is_settled(answers, "live_when"):
        when = str(answers.get("live_when") or "times to suit your students")
        price = answers.get("event_price")
        lines.append({"label": "Classes", "value": f"{when}" + (f", {_money(price, tenant)} each" if price else "")})
        if answers.get("calendar_nav") != "no":
            lines.append({"label": "Class calendar", "value": "A month grid, linked in your menu"})
    return lines


def _free_effects(tenant, answers, flow) -> list[str]:
    """What make_free() changes, in plain words: it used to switch off the
    memberships and drop live classes without saying so."""
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    out = []
    drafts = flow.get("drafts") or {}
    course = Course.objects.filter(pk=drafts["course"], pricing_type="paid").first() if drafts.get("course") else None
    if course:
        out.append(f"Your course \u201c{course.title}\u201d becomes free.")
    names = list(
        SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow), is_active=True).values_list("name", flat=True)
    )
    if names:
        joined = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"
        out.append(f"{joined} {'is' if len(names) == 1 else 'are'} switched off.")
    offers = set(answers.get("offers") or [])
    if not _live_entitled(tenant) and {"live", "onsite"} & offers:
        rest = offers - {"live", "onsite"}
        out.append(
            "Live classes need a paid plan, so they come off your site for now, with your first class."
            + ("" if rest else " Your site goes live with its pages.")
        )
    elif (drafts.get("event") or {}).get("id") and answers.get("event_price"):
        out.append("Your first class becomes free.")
    if out:
        out.append("You can choose a plan and add prices back any time.")
    return out


def _held_lines(held) -> list[str]:
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    out = []
    if title := Course.objects.filter(pk=held.get("course")).values_list("title", flat=True).first():
        out.append(f"Your course \u201c{title}\u201d")
    if names := list(SubscriptionPlan.objects.filter(pk__in=held.get("plans") or []).values_list("name", flat=True)):
        out.append(f"Your {'membership' if len(names) == 1 else 'memberships'}: {', '.join(names)}")
    if held.get("event"):
        out.append("Your classes")
    return out


def _event_model(event):
    from apps.live.models import LiveClass, OnsiteEvent

    return OnsiteEvent if event.get("kind") == "onsite" else LiveClass


def sell_later(tenant) -> None:
    """Go live now and sell later: the paid course stays a draft, the
    memberships stay off and a class her plan can't run stays off the
    calendar, all with her prices kept (make_free throws them away).
    release_held() puts them on sale once she can take payments."""
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    from .setup_flow import _update_flow

    drafts = (TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}
    held = {}
    if Course.objects.filter(pk=drafts.get("course"), pricing_type="paid", is_published=False).exists():
        held["course"] = drafts["course"]
    if plan_ids := membership_plan_ids({"drafts": drafts}):
        SubscriptionPlan.objects.filter(pk__in=plan_ids).update(is_active=False)
        held["plans"] = plan_ids
    event = drafts.get("event") or {}
    row = _event_model(event).objects.filter(pk=event.get("id")).first() if event.get("id") else None
    if row is not None and (not _live_entitled(tenant) or (row.pricing_type == "paid" and not can_monetize(tenant))):
        type(row).objects.filter(pk=row.pk).update(status="draft")
        held["event"] = {"id": row.pk, "kind": event.get("kind"), "status": row.status}

    def mutate(_config, flow):
        flow["held"] = held

    _update_flow(tenant, mutate)


def release_held(tenant) -> None:
    """Put what sell_later() held on sale, each part once she can: the course
    and memberships with payouts, the classes with a plan that runs them
    (and payouts when they cost money)."""
    from apps.billing.models import SubscriptionPlan
    from apps.core.copilot import content

    from .setup_flow import _update_flow

    config = TenantConfig.objects.first()
    held = dict((config.setup_flow or {}).get("held") or {}) if config else {}
    if not held:
        return
    selling = can_monetize(tenant)
    if selling and held.get("course"):
        with suppress(content.ContentOpError):  # published by hand meanwhile, or deleted
            content.publish_course(held.pop("course"))
    if selling and held.get("plans"):
        SubscriptionPlan.objects.filter(pk__in=held.pop("plans")).update(is_active=True)
    event = held.get("event")
    if event and _live_entitled(tenant):
        model = _event_model(event)
        row = model.objects.filter(pk=event["id"]).first()
        if row is None or row.pricing_type != "paid" or selling:
            model.objects.filter(pk=event["id"], status="draft").update(status=event.get("status") or "scheduled")
            held.pop("event")
            expand_class_series(tenant)

    def mutate(_config, flow):
        if held:
            flow["held"] = held
        else:
            flow.pop("held", None)

    _update_flow(tenant, mutate)
    if not held:
        logger.info("sell later: held items released for tenant %s", tenant.schema_name)


# publish() publishes the interview's drafts itself, so these never need
# the coach's attention once the draft exists.
_SELF_RESOLVED = {"first_course": "course", "first_blog_post": "post"}


def _open_blockers(config, tenant, flow) -> list[str]:
    drafts = flow.get("drafts") or {}
    return [b for b in publish_blockers(config, tenant) if not drafts.get(_SELF_RESOLVED.get(b, ""))]


def publish(tenant) -> None:
    """Publish the interview's drafts, then the site. Raises
    setup_flow.PublishBlockedError when a requirement is still unmet."""
    from apps.core.copilot import content

    from . import setup_flow

    flow = TenantConfig.objects.first().setup_flow or {}
    drafts, held = flow.get("drafts") or {}, flow.get("held") or {}
    for kind, publisher in (("course", content.publish_course), ("post", content.publish_blog_post)):
        if drafts.get(kind) and not held.get(kind):
            with suppress(content.ContentOpError):  # already published, or the draft is gone
                publisher(drafts[kind])
    if _live_entitled(tenant) and not held.get("event"):
        expand_class_series(tenant)  # a weekly schedule becomes its classes
    setup_flow.act(tenant, "finish", publish=True)


def make_free(tenant) -> None:
    """The coach declined the plan or Stripe: everything free, live classes
    (which need a paid plan) dropped from the offer for now."""
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course
    from apps.live.models import LiveClass, OnsiteEvent

    answers = brief.answers_of(tenant)
    base = dict(answers)
    answers["sells"] = "free"
    answers["payments"] = ["free"]
    for key in ("course_price", "memberships", "event_price"):
        answers.pop(key, None)
    live_dropped = not _live_entitled(tenant) and bool({"live", "onsite"} & set(answers.get("offers") or []))
    if live_dropped:
        # Never invent an offer: with nothing left, the site goes live with its
        # pages, and the empty offer list counts as settled.
        rest = [o for o in answers["offers"] if o not in ("live", "onsite")]
        answers["offers"] = rest
        answers["goals"] = sorted({brief.OFFER_GOALS[o] for o in rest})
        if not rest:
            brief.delegate(answers, "offers")
    brief.save_answers(tenant, answers, base=base)
    flow = TenantConfig.objects.first().setup_flow or {}
    drafts = flow.get("drafts") or {}
    if drafts.get("course"):
        Course.objects.filter(pk=drafts["course"], pricing_type="paid").update(pricing_type="free", price=0)
    event = drafts.get("event") or {}
    if live_dropped and event:
        drop_draft(tenant, "event")  # the drafted class goes with the live offer
    elif event.get("id"):
        model = OnsiteEvent if event.get("kind") == "onsite" else LiveClass
        model.objects.filter(pk=event["id"], pricing_type="paid").update(pricing_type="free", price=0)
    if plan_ids := membership_plan_ids(flow):
        SubscriptionPlan.objects.filter(pk__in=plan_ids).update(is_active=False)
