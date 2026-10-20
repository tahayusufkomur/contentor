"""The hand-off at go-live: one line per specialist saying what they did during
setup and the one thing to do next. Code-owned copy; a clause whose data is
missing is dropped, and no line promises more than the platform does today."""

from apps.core.copilot import team
from apps.core.monetization import can_monetize

from . import interview_brief as brief
from . import setup_flow as flow_mod
from .interview_golive import _PAGE_LABELS
from .interview_milestones import membership_plan_ids

# How each contact way reads in a sentence (the options of the contact question).
_WAYS = {"Email": "email", "Phone": "phone", "Contact form": "contact form"}


def _ways(answers: dict) -> list[str]:
    raw = answers.get("contact") or ""
    text = "; ".join(raw) if isinstance(raw, list) else str(raw)
    field = brief.FIELD_BY_ID["contact"]
    return [_WAYS.get(way, way) for way in field.options if way in text]


def handoff(tenant, answers: dict, flow: dict, *, sells: bool = False) -> list[dict]:
    """Six lines in ``team.KEYS`` order. ``sells`` is golive_state's own notion
    (a paid item, or a paid brief), so payouts read the same here as there."""
    from apps.billing.models import SubscriptionPlan

    snap = flow_mod.content_snapshot(flow)
    course = (snap["course"] or {}).get("title")
    klass = (snap["event"] or snap.get("onsite") or {}).get("title")
    post = (snap["post"] or {}).get("title")
    plans = list(
        SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow), is_active=True)
        .order_by("pk")
        .values_list("name", flat=True)
    )
    pages = [label for key, label in _PAGE_LABELS.items() if key in (flow.get("page_builds") or {})]
    look = brief.is_settled(answers, "site_style")
    ways = _ways(answers)
    made = [t for t in (course, klass) if t]

    if pages:
        built = f"Built your {brief.say_list(pages)} {'pages' if len(pages) > 1 else 'page'}"
        designer = built + (" and your look." if look else ".")
    else:
        designer = "Set your look." if look else "Looks after your site."

    lines = {
        "designer": (designer, "Ask me to change any page, any time."),
        "content": (
            f"Drafted {brief.say_list(made)}." if made else "Ready when you want to make your first course or class.",
            f"Next: record the first lesson of {course}."
            if course
            else f"Next: check the date and time of {klass}."
            if klass
            else "Tell me what you'd like to make first.",
        ),
        "marketing": (
            f"Drafted your first article, {post}." if post else "Ready to help new students find you.",
            f"Next: publish {post} when you're happy with it."
            if post
            else "Next: share your site where your students are.",
        ),
        "community": (
            f"Set up how students reach you: {brief.say_list(ways)}."
            if ways
            else "Looks after how students reach you.",
            "Messages from students land in your inbox.",
        ),
        "finance": (
            f"Set up {brief.say_list(plans)}."
            if plans
            else "Set your first prices."
            if sells
            else "Kept everything free for now.",
            "Next: connect payouts so you can get paid."
            if sells and not can_monetize(tenant)
            else "You can change any price in its Access section.",
        ),
        "assistant": ("Ran your setup.", "Not sure who to ask? Ask me."),
    }
    return [{"key": key, "did": lines[key][0], "next": lines[key][1]} for key in team.KEYS]
