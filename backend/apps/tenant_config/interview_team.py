"""The hand-off at go-live: one line per specialist saying what they did during
setup and the one thing to do next. Code-owned copy; a clause whose data is
missing is dropped, and no line promises more than the platform does today."""

from django.utils.translation import gettext as _
from django.utils.translation import gettext as render_marked
from django.utils.translation import gettext_noop, ngettext

from apps.core.copilot import team
from apps.core.monetization import can_monetize

from . import interview_brief as brief
from . import setup_flow as flow_mod
from .interview_golive import _PAGE_LABELS
from .interview_milestones import membership_plan_ids

# How each contact way reads in a sentence (the options of the contact question).
# (the English text is the way's identity; its sentence word is translated where it is read.)
_WAYS = {
    "Email": gettext_noop("email"),
    "Phone": gettext_noop("phone"),
    "Contact form": gettext_noop("contact form"),
}


def _ways(answers: dict) -> list[str]:
    raw = answers.get("contact") or ""
    text = "; ".join(raw) if isinstance(raw, list) else str(raw)
    field = brief.FIELD_BY_ID["contact"]
    return [render_marked(_WAYS[way]) if way in _WAYS else way for way in field.options if way in text]


def handoff(tenant, answers: dict, flow: dict, *, sells: bool = False) -> list[dict]:
    """Six lines in ``team.KEYS`` order. ``sells`` is golive_state's own notion
    (a paid item, or a paid brief), so payouts read the same here as there."""
    from apps.billing.models import SubscriptionPlan

    snap = flow_mod.content_snapshot(flow)
    course = (snap["course"] or {}).get("title")
    klass = (snap["event"] or snap.get("onsite") or {}).get("title")
    post = (snap["post"] or {}).get("title")
    post_live = bool((snap["post"] or {}).get("is_published"))
    plans = list(
        SubscriptionPlan.objects.filter(pk__in=membership_plan_ids(flow), is_active=True)
        .order_by("pk")
        .values_list("name", flat=True)
    )
    builds = flow.get("page_builds") or {}
    pages = [str(label) for key, label in _PAGE_LABELS.items() if (builds.get(key) or {}).get("status") == "ready"]
    look = brief.is_settled(answers, "site_style")
    ways = _ways(answers)
    made = [t for t in (course, klass) if t]

    if pages:
        names = {"names": brief.list_phrase(pages)}
        if look:
            designer = brief.sentence(
                ngettext(
                    "Built your %(names)s page and your look.", "Built your %(names)s pages and your look.", len(pages)
                )
                % names
            )
        else:
            designer = brief.sentence(
                ngettext("Built your %(names)s page.", "Built your %(names)s pages.", len(pages)) % names
            )
    else:
        designer = _("Set your look.") if look else _("Looks after your site.")

    lines = {
        "designer": (designer, _("Ask me to change any page, any time.")),
        "content": (
            brief.sentence(_("Drafted %(made)s.") % {"made": brief.list_phrase(made)})
            if made
            else _("Ready when you want to make your first course or session."),
            _("Next: record the first lesson of %(course)s.") % {"course": course}
            if course
            else _("Next: check the date and time of %(class)s.") % {"class": klass}
            if klass
            else _("Tell me what you'd like to make first."),
        ),
        "marketing": (
            (_("Wrote your first article, %(post)s.") if post_live else _("Drafted your first article, %(post)s."))
            % {"post": post}
            if post
            else _("Ready to help new students find you."),
            _("Next: share %(post)s with your students.") % {"post": post}
            if post and post_live
            else _("Next: publish %(post)s when you're happy with it.") % {"post": post}
            if post
            else _("Next: share your site where your students are."),
        ),
        "community": (
            _("Set up how students reach you: %(ways)s.") % {"ways": brief.list_phrase(ways)}
            if ways
            else _("Looks after how students reach you."),
            _("Messages from students land in your inbox."),
        ),
        "finance": (
            brief.sentence(_("Set up %(plans)s.") % {"plans": brief.list_phrase(plans)})
            if plans
            else _("Set your first prices.")
            if sells
            else _("Kept everything free for now."),
            _("Next: connect payouts so you can get paid.")
            if sells and not can_monetize(tenant)
            else _("You can change any price in its Access section."),
        ),
        "assistant": (_("Ran your setup."), _("Not sure who to ask? Ask me.")),
    }
    return [{"key": key, "did": lines[key][0], "next": lines[key][1]} for key in team.KEYS]
