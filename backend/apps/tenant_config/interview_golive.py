"""Go-live for the /setup interview: what still stands between the coach and
a published site (a paid plan and Stripe only when they sell), publishing,
and the "make it free and go live now" way out."""

from contextlib import suppress

from apps.core.monetization import can_monetize, is_paid_active

from . import interview_brief as brief
from .interview_milestones import drop_draft, expand_class_series, fire, membership_plan_ids
from .models import TenantConfig
from .setup_items import _has_paid_content, _live_entitled, _seeded_by_label, publish_blockers


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
    paid_content = _has_paid_content(_seeded_by_label())
    wants_live = bool({"live", "onsite"} & set(answers.get("offers") or [])) and not _live_entitled(tenant)
    paid = is_paid_active(tenant)
    # Selling is known from the brief even before a paid course exists.
    sells = paid_content or answers.get("sells") == "paid"
    needs_plan = (sells or wants_live) and not paid
    return {
        "ready": not brief.missing(answers) and not building,
        "building": building,
        "needs_plan": needs_plan,
        "needs_payouts": paid_content and paid and not can_monetize(tenant),
        "plan": _starter_plan(tenant) if needs_plan else None,
        "blockers": _open_blockers(config, tenant, flow),
    }


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

    drafts = (TenantConfig.objects.first().setup_flow or {}).get("drafts") or {}
    for kind, publisher in (("course", content.publish_course), ("post", content.publish_blog_post)):
        if drafts.get(kind):
            with suppress(content.ContentOpError):  # already published, or the draft is gone
                publisher(drafts[kind])
    if _live_entitled(tenant):
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
        brief.apply_fact(
            answers, "offers", ", ".join(o for o in answers["offers"] if o not in ("live", "onsite")) or "course"
        )
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
