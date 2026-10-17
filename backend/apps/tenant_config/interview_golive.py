"""Go-live for the /setup interview: what still stands between the coach and
a published site (a paid plan and Stripe only when they sell), publishing,
and one way out: "go live now, sell later" (paid items held, prices kept).
There is no going free: only paid plans exist, and a trial cannot sell, so a
trial whose site sells starts its plan now or sells later."""

import logging
from contextlib import suppress

from apps.core.models import PlatformSubscription
from apps.core.monetization import can_monetize, is_paid_active, trial_days_for

from . import interview_brief as brief
from . import site_qa
from .interview_milestones import _draft_row, expand_class_series, fire, membership_plan_ids
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
    return {
        "id": plan.pk,
        "name": plan.name,
        "amount_cents": entry.get("amount_cents"),
        "currency": currency,
        "trial_days": trial_days_for(tenant, plan),
    }


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
    paid_content = _has_paid_content(_seeded_by_label(), held_course=_held_course(flow))
    wants_live = bool({"live", "onsite"} & set(answers.get("offers") or [])) and not _live_entitled(tenant)
    paid = is_paid_active(tenant)
    # Selling is known from the brief even before a paid course exists; a
    # coach who chose to sell later goes live first (paid content she did not
    # hold still needs the plan and payouts).
    sells = paid_content or (answers.get("sells") == "paid" and held is None)
    wants_live = wants_live and held is None
    sub = getattr(tenant, "platform_subscription", None)  # DoesNotExist is an AttributeError
    trialing = getattr(sub, "status", None) == PlatformSubscription.STATUS_TRIALING
    if tenant.requires_plan:
        # No Free plan to go live on: the trial first. It cannot sell, so a
        # site that sells starts the plan now or takes a way out.
        needs_plan = tenant.is_paused
        needs_start = trialing and sells
    else:
        needs_plan = (sells or wants_live) and not paid
        needs_start = False
    needs_payouts = paid_content and paid and not can_monetize(tenant)
    # Every step left, with its time, shown at once (it used to appear one card at a time).
    steps = [
        *(
            [
                {
                    "id": "plan",
                    "label": "Start your free trial" if tenant.requires_plan else "Choose a plan",
                    "minutes": 2,
                    "done": not needs_plan,
                }
            ]
            if sells or wants_live or tenant.requires_plan
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
    ready = not brief.missing(answers) and not building
    return {
        "ready": ready,
        "building": building,
        # The finished site's last visual check, started here once it is built.
        "qa": site_qa.ensure(tenant, config) if ready else None,
        "needs_plan": needs_plan,
        # A trial whose site sells: selling opens when the plan starts.
        "needs_start": needs_start,
        "trial_end": sub.current_period_end.isoformat() if trialing and sub.current_period_end else None,
        "needs_payouts": needs_payouts,
        "plan": _starter_plan(tenant) if needs_plan or needs_start else None,
        "blockers": _open_blockers(config, tenant, flow),
        "steps": steps,
        "summary": _summary(tenant, answers, flow),
        # What waits, with its prices, until she can take payments.
        "held": _held_lines(held or {}, flow),
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
        price = {"paid": _money(course.price, tenant), "subscription": "members only"}.get(course.pricing_type, "free")
        lines.append({"label": "First course", "value": f"{course.title} ({price})"})
    plans = SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow), is_active=True)
    if plans:
        value = ", ".join(f"{p.name} ({_money(p.price, tenant)} a month)" for p in plans)
        lines.append({"label": "Memberships", "value": value})
    offers = set(answers.get("offers") or [])
    runs = False
    for offer, label, when_id, price_id, key in (
        ("live", "Online classes", "live_when", "event_price", "event"),
        ("onsite", "In-person events", "onsite_when", "onsite_price", "onsite"),
    ):
        if offer in offers and brief.is_settled(answers, when_id):
            when = str(answers.get(when_id) or "times to suit your students")
            # The drafted class says how it is opened: sold per class, to members only, or free.
            row = _draft_row(flow, key)
            price = answers.get(price_id) if row is None or row.pricing_type == "paid" else None
            how = ", members only" if row is not None and row.pricing_type == "subscription" else ""
            lines.append(
                {"label": label, "value": f"{when}{how}" + (f", {_money(price, tenant)} each" if price else "")}
            )
            runs = True
    if runs and answers.get("calendar_nav") != "no":
        lines.append({"label": "Class calendar", "value": "A month grid, linked in your menu"})
    return lines


# Held and released together; each keeps its own draft.
_CLASSES = ("event", "onsite")


def _held_course(flow):
    """The course draft "sell later" holds back, as it is now (a redraft
    replaces the row)."""
    return (flow.get("drafts") or {}).get("course") if (flow.get("held") or {}).get("course") else None


def _held_lines(held, flow) -> list[str]:
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    out = []
    if title := Course.objects.filter(pk=_held_course(flow)).values_list("title", flat=True).first():
        out.append(f"Your course \u201c{title}\u201d")
    plans = SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow) if held.get("plans") else [])
    if names := list(plans.values_list("name", flat=True)):
        out.append(f"Your {'membership' if len(names) == 1 else 'memberships'}: {', '.join(names)}")
    if any(k in held for k in _CLASSES):
        out.append("Your classes")
    return out


def _hold(tenant) -> dict:
    """Hold back what can't be sold yet, in the drafts as they are now: a
    redraft or a membership added since "sell later" is held too. Returns
    what is held: {course: True, plans: True, event/onsite: the status each
    class goes back to}."""
    from apps.billing.models import SubscriptionPlan
    from apps.courses.models import Course

    flow = TenantConfig.objects.first().setup_flow or {}
    drafts, before = flow.get("drafts") or {}, flow.get("held") or {}
    held = {}
    if Course.objects.filter(pk=drafts.get("course"), is_published=False).exclude(pricing_type="free").exists():
        held["course"] = True
    if plan_ids := membership_plan_ids(flow):
        SubscriptionPlan.objects.filter(pk__in=plan_ids).update(is_active=False)
        held["plans"] = True
    for key in _CLASSES:
        row = _draft_row(flow, key)
        if row is not None and (
            not _live_entitled(tenant) or (row.pricing_type != "free" and not can_monetize(tenant))
        ):
            # Back to the status it had before the first hold, never to "draft".
            held[key] = before.get(key) or (row.status if row.status != "draft" else "scheduled")
            type(row).objects.filter(pk=row.pk).update(status="draft")
    return held


def _save_held(tenant, held) -> None:
    from .setup_flow import _update_flow

    def mutate(_config, flow):
        if held is None:
            flow.pop("held", None)
        else:
            flow["held"] = held

    _update_flow(tenant, mutate)


def sell_later(tenant) -> None:
    """Go live now and sell later: the paid course stays a draft, the
    memberships stay off and a class her plan can't run stays off the
    calendar, all with her prices kept.
    release_held() puts them on sale once she can take payments."""
    _save_held(tenant, _hold(tenant))


def release_held(tenant) -> None:
    """Put what sell_later() held on sale, each part once she can: the course
    and memberships with payouts, the classes with a plan that runs them
    (and payouts when they cost money)."""
    from apps.billing.models import SubscriptionPlan
    from apps.core.copilot import content

    config = TenantConfig.objects.first()
    flow = (config.setup_flow or {}) if config else {}
    held = dict(flow.get("held") or {})
    if not held:
        return
    selling = can_monetize(tenant)
    if selling and held.pop("course", None):
        with suppress(content.ContentOpError):  # published by hand meanwhile, or deleted
            content.publish_course((flow.get("drafts") or {}).get("course"))
    if selling and held.pop("plans", None):
        SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow)).update(is_active=True)
    for key in _CLASSES:
        if key not in held or not _live_entitled(tenant):
            continue
        row = _draft_row(flow, key)
        if row is not None and row.pricing_type != "free" and not selling:
            continue
        status = held.pop(key)
        # Only the request that flips it expands the series: two admin pages
        # loading at once never copy the classes twice.
        flipped = row is not None and type(row).objects.filter(pk=row.pk, status="draft").update(status=status)
        if flipped:
            expand_class_series(tenant, key)
    _save_held(tenant, held or None)
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
    held = {}
    if "held" in flow:  # "sell later": hold the drafts as they are now
        held = _hold(tenant)
        _save_held(tenant, held)
    drafts = flow.get("drafts") or {}
    for kind, publisher in (("course", content.publish_course), ("post", content.publish_blog_post)):
        if drafts.get(kind) and not held.get(kind):
            with suppress(content.ContentOpError):  # already published, or the draft is gone
                publisher(drafts[kind])
    if _live_entitled(tenant):
        for key in _CLASSES:
            if not held.get(key):
                expand_class_series(tenant, key)  # a weekly schedule becomes its classes
    setup_flow.act(tenant, "finish", publish=True)
