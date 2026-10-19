"""The course in focus mode (spec §5 and §7.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): its questions, its
draft Course, and how that course is priced, checked and published."""

from decimal import Decimal
from typing import Literal

from django.db import connection
from pydantic import BaseModel

from apps.tenant_config.interview_brief import Field

from .. import analysis
from ..recipes import Recipe

NOUN = "course"
NEW_TITLE = "New course"
CLOSING = {
    "publish": "Published. Students can find it on your site now.",
    "draft": "Saved as a draft. Once every lesson has its video or text, publish it from this page.",
}
# The finish step while a lesson is still empty: no "Publish now".
NOT_READY_LINE = "Your outline is saved. Next, your lessons."

RECIPE = Recipe(
    kind="course",
    questions=(
        Field(
            "topic",
            "Topic",
            "What will your students learn?",
            ("A course on ",),
            delegable=True,
            starter=True,
            why=(
                "Say as much as you know: who it's for, how many modules and lessons, lesson titles, "
                "the price. I'll fill in the rest for you to check."
            ),
        ),
        Field(
            "level",
            "Who it is for",
            "Who is it for?",
            ("Complete beginners", "Some experience", "Advanced"),
            kind="choice",
            delegable=True,
            why="It sets the pace, and the words the lessons use.",
        ),
        Field(
            "size",
            "Size",
            "How big should it be?",
            ("Quick win", "Short course", "Full program"),
            kind="choice",
            hints=("1 module · 3–4 lessons", "3 modules · about 12 lessons", "6 modules"),
            delegable=True,
            why="You can add or remove lessons any time.",
        ),
        Field(
            "outline_review",
            "Outline",
            "Here's your outline. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "cover",
            "Cover",
            "Which cover fits your course?",
            kind="cover",
            why=(
                "Pick a style on the page. The photo row under it changes the photo in all four; "
                "upload one, or tell me what you want."
            ),
        ),
        Field(
            "access",
            "Access",
            "How will students get it?",
            kind="price",
            delegable=True,
            why="You can change it any time.",
        ),
        Field(
            "finish",
            "Finish",
            "Ready. Publish it now?",
            ("Publish now", "Keep as a draft"),
            kind="finish",
            why="A draft stays hidden from students until you publish it.",
        ),
        # Only after "Publish now" with "Tell my students" ticked; answered by its own taps.
        Field("announce", "Announcement", "Tell your students?", kind="announce"),
    ),
    specialists={
        "topic": "content",
        "level": "content",
        "size": "content",
        "outline_review": "content",
        "cover": "designer",
        "access": "finance",
        "finish": "marketing",
        "announce": "marketing",
    },
    values={
        "level": ("beginners", "some", "advanced"),
        "size": ("quick", "short", "full"),
        "finish": ("publish", "draft"),
    },
)

# Course size -> (modules, lessons per module).
SIZES: dict[str, tuple[int, int]] = {"quick": (1, 4), "short": (3, 4), "full": (6, 4)}


class NamedModule(BaseModel):
    title: str = ""
    lessons: list[str] = []


class CourseUnclear(analysis.Unclear):
    """Her words leave a course detail vague: only these fields, so the model's output schema says so."""

    field: Literal["modules", "lessons", "price", "level"]


class CourseFound(analysis.Found):
    """What the analysis reads from her words about a course, besides what every kind shares."""

    level: str = ""  # beginners | some | advanced | her own words
    modules: int | None = None
    lessons: int | None = None  # per module
    total: int | None = None  # lessons in all, when she gave a total instead
    named: list[NamedModule] = []  # in her order; lessons she named without a module go in one untitled module
    unclear: list[CourseUnclear] = []


FOUND = CourseFound
# Appended to the shared rules in the analysis prompt (apps.core.focus.analysis.system_for).
RULES = (
    "- level: 'beginners' (complete beginners), 'some' (some experience) or 'advanced' when it "
    "matches; otherwise who it is for, in her words.\n"
    "- modules: how many modules. lessons: how many lessons per module. total: how many lessons in "
    "all, only when she gave a total instead of a number per module.\n"
    "- named: the module and lesson titles she wrote, word for word and in her order. Lessons she "
    "named without a module go in one module with an empty title."
)
UNCLEAR_FIELDS = ("modules", "lessons", "price", "level")


def create_draft(actor, title: str, answers: dict) -> int | None:
    """The unpublished draft course, from her first answer."""
    from apps.core.copilot import content

    return content.create_course(actor, {"title": title}, cover=False)["id"]


def record(record_id):
    from apps.courses.models import Course

    return Course.objects.filter(pk=record_id).first() if record_id else None


def payload(course) -> dict:
    # ``slug`` too: the studio still navigates by it until it reads ``path``.
    return {"id": course.id, "slug": course.slug, "title": course.title, "path": f"/admin/courses/{course.slug}"}


def retitle(record_id: int, provisional: str, title: str) -> bool:
    """The new title, only while the course still has the provisional one."""
    from apps.courses.models import Course

    return bool(Course.objects.filter(pk=record_id, title=provisional).update(title=title))


def set_price(record_id: int, value: str) -> None:
    from apps.courses.models import Course

    course = Course.objects.filter(pk=record_id)
    if value == "free":
        course.update(pricing_type="free", price=0)
    else:
        course.update(pricing_type="paid", price=Decimal(value))


def put_in_plan(record_id: int, plan) -> None:
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess
    from apps.courses.models import Course

    Course.objects.filter(pk=record_id).update(pricing_type="subscription")
    SubscriptionPlanAccess.objects.get_or_create(
        plan=plan, content_type=ContentType.objects.get_for_model(Course), object_id=record_id
    )


def not_ready(course) -> str:
    """Why it cannot go live yet (an empty lesson), or ""."""
    return course.not_ready() or ""


def cannot_sell(course) -> bool:
    """A paid course while selling is not open yet (her plan, then payouts)."""
    from apps.core import monetization

    return course.pricing_type == "paid" and not monetization.can_monetize(connection.tenant)


def go_live(record_id: int) -> None:
    from apps.core.copilot import content

    content.publish_course(record_id)


def skips(creation) -> set[str]:
    return set()


def _gave_counts(found) -> bool:
    return any(n is not None for n in (found.modules, found.lessons, found.total))


def apply_found(creation, found) -> None:
    """Her typed answer, read, onto the course: its level, counts and size
    label. ``flow.apply`` calls it before the shared answer step. Call under
    the creation's lock; the caller saves."""
    from .. import flow

    if found.level.strip():
        creation.answers["level"] = flow._choice(RECIPE, "level", found.level)
    creation.brief = analysis.brief_from(found, creation.brief)
    if (_gave_counts(found) or found.named) and (label := flow.size_label(creation.brief)):
        creation.answers["size"] = label


def apply_change(creation, found, *, field, text, item, clarified, fresh) -> None:
    """The outline redrafted when she changed it or gave counts (or waits on
    one). ``flow.apply`` calls it after the shared answer step: ``item`` is
    the clarify question she just answered (None if she did not),
    ``clarified`` whether that gave a count, ``fresh`` the clarify questions
    this reading adds. Call under the creation's lock; the caller saves."""
    from .. import flow

    keep = _gave_counts(found)
    counted = keep or bool(found.named)
    counts = [c for c in fresh if c["field"] in ("modules", "lessons")]
    drafted = creation.outline_run_id is not None or bool((creation.drafted or {}).get("modules"))
    # A level is a change to the outline; a price alone is not.
    price = analysis.price_value(found.price)
    at_review = field == "outline_review" and (found.answer.strip() or found.level.strip() or not price)
    if item and (waiting := flow._waiting(creation, item)):
        # A change waits on her count: what she says meanwhile goes with it, one redraft in all.
        if found.change.strip():
            waiting["redraft"] = f"{waiting['redraft']}; {text}"
        waiting["keep_counts"] = waiting["keep_counts"] or keep
        if waiting is item:
            flow._redraft_waiting(creation, item, clarified or counted)
    elif drafted and (found.change.strip() or counted or at_review):
        if counts:  # her count first: one redraft, once she has said it (or left it to us)
            counts[-1].update(redraft=text, keep_counts=keep)
        else:
            flow._redraft(creation, text, keep_counts=keep)


def apply_clarified(creation, field, value) -> bool:
    """Her answer to a clarify question about the course's level or a count,
    onto the field it asked about. One that is still no count leaves that
    field to its usual question. True when it gave a count."""
    from .. import flow

    if field == "level":
        creation.answers["level"] = flow._choice(RECIPE, "level", value)
    elif field in ("modules", "lessons"):
        try:
            count = int(value)
        except ValueError:
            return False
        creation.brief = analysis.brief_from(CourseFound(**{field: count}), creation.brief)
        creation.answers["size"] = flow.size_label(creation.brief)
        return True
    return False
