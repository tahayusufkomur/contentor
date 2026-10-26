"""The course in focus mode (spec §5 and §7.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): its questions, its
draft Course, and how that course is priced, checked and published."""

import re
from decimal import Decimal
from statistics import median
from typing import Literal

from django.db import connection
from django.db.models import Count, Q
from pydantic import BaseModel

from apps.tenant_config.interview_brief import Field

from .. import analysis, pricing
from ..recipes import Recipe

NOUN = "course"
NEW_TITLE = "New course"
# The /setup answer that seeds the topic's starter tile.
SETUP_TOPIC = "course_topic"
COVER = "styles"
ANNOUNCER = "marketing"
# The follow-up slot before the outline drafts, and what it writes (apps.core.focus.followup).
DRAFT_SLOT = "outline"
DRAFT_WHAT = "title, description, modules and lessons"
# The dock's line after her "Looks good": the descriptions job starts.
REVIEWED_LINE = "Writing a short description for each lesson's video. Edit any of them on the page."
FINISH = (("publish", "Publish now"), ("draft", "Keep as a draft"))
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
    "- topic: what her students will learn, short, in her words.\n"
    "- level: 'beginners' (complete beginners), 'some' (some experience) or 'advanced' when it "
    "matches; otherwise who it is for, in her words.\n"
    "- modules: how many modules. lessons: how many lessons per module. total: how many lessons in "
    "all, only when she gave a total instead of a number per module.\n"
    "- A course of 'N days' or 'N lessons' is total N (a lesson a day); 'N weeks' or 'N modules' is "
    "modules N.\n"
    "- named: the module and lesson titles she wrote, word for word and in her order. Lessons she "
    "named without a module go in one module with an empty title.\n"
    "- unclear: a count, amount or level she gave vaguely ('a few modules', 'around 40-50'), or a price "
    "in a currency other than 'currency', becomes one item instead of a value: its field (modules, "
    "lessons, price or level), one short question, and 2-4 options, each a short label and its value "
    "(a number like '3', an amount like '45', 'free', or beginners | some | advanced). Leave that field "
    "itself empty."
)
UNCLEAR_FIELDS = ("modules", "lessons", "price", "level")


def create_draft(actor, title: str, answers: dict) -> int | None:
    """The unpublished draft course, from her first answer."""
    from apps.core.copilot import content

    return content.create_course(actor, {"title": title}, cover=False)["id"]


def start_draft(creation, instruction: str = ""):
    """The outline job: what the review step shows (apps.core.focus.outline)."""
    from .. import outline

    return outline.start(creation, instruction=instruction)


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


def suggest_price(course) -> pricing.Suggestion:
    """The first rule that has her numbers: her other courses on sale, the
    price she gave in /setup, else a starting point by the course's size."""
    from apps.courses.models import Course
    from apps.tenant_config.interview_brief import DELEGATE, answers_of, money, parse_price

    # Published only: "sells for" is a claim, and a draft sells nothing.
    others = list(
        Course.objects.filter(pricing_type="paid", price__gt=0, is_published=True)
        .exclude(pk=course.pk)
        .annotate(students=Count("enrollments", filter=Q(enrollments__is_active=True)))
        .order_by("price")
    )
    if others:
        low, high = others[0].price, others[-1].price
        if len(others) == 1:
            reason = f"{others[0].title} sells for {money(low)}"
        else:
            reason = f"Your other courses sell for {money(low)}" + (f"–{money(high)}" if high != low else "")
        best = max(others, key=lambda c: c.students)
        if best.students:
            reason += f"; {best.title} has {best.students} student{'' if best.students == 1 else 's'}"
        return pricing.Suggestion(pricing.whole(median(c.price for c in others)), reason)
    given = answers_of(connection.tenant).get("course_price")
    if given != DELEGATE and (price := parse_price(given)):
        return pricing.Suggestion(pricing.whole(Decimal(str(price))), pricing.SETUP)
    modules = course.modules.count()
    return pricing.Suggestion(Decimal(19 if modules <= 1 else 39 if modules <= 3 else 69), pricing.FALLBACK)


set_price = None  # the shared tiles: the flow writes the ways in (apps.billing.ways)


def price_tiles(creation, course) -> None:
    """The shared tiles: Free, the suggestion and her memberships."""
    return None


def cover_target(course) -> tuple[str, str]:
    return ("course", str(course.pk))


def cover_facts(course) -> dict:
    return {"title": course.title, "description": course.description}


def announce_facts(course) -> dict:
    return {
        "what": NOUN,
        "title": course.title,
        "description": course.description,
        "link": f"/courses/{course.slug}",
        "when": "",
    }


def not_ready(course) -> str:
    """Why it cannot go live yet (an empty lesson), or ""."""
    return course.not_ready() or ""


def cannot_sell(course) -> bool:
    """A course sold once or in a subscription (no free way covering them) while
    selling is not open yet (her plan, then payouts)."""
    from apps.core import monetization

    return course.pricing_type != "free" and not monetization.can_monetize(connection.tenant)


def go_live(record_id: int) -> None:
    from apps.core.copilot import content

    content.publish_course(record_id)


def skips(creation) -> set[str]:
    return set()


def _gave_counts(found) -> bool:
    return any(n is not None for n in (found.modules, found.lessons, found.total))


# A count in digits with its unit: "21-day" and "30 lessons" are lessons in all (a lesson a day), "8 weeks" and
# "5 modules" are modules. Not a range ("40-50 lessons") nor a rate ("3 lessons a week"): those are the model's.
_COUNT = re.compile(
    r"(?<![\d\-\u2013])(\d{1,3})[\s-]*(days?|lessons?|sessions?|videos?|classes|weeks?|modules?)\b(\s+(?:per|a|each|every)\b)?",
    re.IGNORECASE,
)


def counts_in(text: str) -> dict[str, int]:
    """The one plain count in her words ({"total": 21} or {"modules": 8}); {}
    when there is none, or modules and lessons both appear (which is per
    module is the model's reading) or one is a rate."""
    found: dict[str, int] = {}
    for number, unit, rate in _COUNT.findall(text):
        if rate:
            return {}
        found.setdefault("modules" if unit.lower().startswith(("week", "module")) else "total", int(number))
    return found if len(found) == 1 else {}


def read_counts(found, text: str) -> None:
    """The count the model missed, from her digits (``counts_in``), onto
    ``found``: "A 21 day yoga challenge" sometimes reads as no count.
    Only when it read none of hers (what it understood, such as "3 lessons a
    week for 8 weeks", wins) and she named no titles. ``analysis.read`` calls
    it for her words before an outline exists: a change to a drafted one
    ("add 2 lessons") is never a count."""
    if _gave_counts(found) or found.named or any(u.field in ("modules", "lessons") for u in found.unclear):
        return
    for field, value in counts_in(text).items():
        setattr(found, field, value)


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
