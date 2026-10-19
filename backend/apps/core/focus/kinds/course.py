"""The course in focus mode (spec §5 and §7.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): its questions, its
draft Course, and how that course is priced, checked and published."""

from decimal import Decimal

from django.db import connection

from apps.tenant_config.interview_brief import Field

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
