"""The analysis of a typed answer: what it asks the model, and the brief and
price it settles from the model's typed fields. The model call is patched;
the flow around it is tested in test_focus_flow.py."""

import json
from decimal import Decimal
from unittest import mock

import pytest

from apps.core import ai as core_ai
from apps.core.focus import analysis
from apps.core.focus.kinds.course import CourseFound, CourseUnclear, NamedModule

pytestmark = pytest.mark.django_db(transaction=True)


def _model(**kwargs):
    if "side_effect" not in kwargs:
        kwargs["return_value"] = (kwargs.pop("found", None) or CourseFound(), Decimal("0.01"), "x")
    return mock.patch("apps.core.focus.analysis.core_ai.structured", **kwargs)


def test_counts_are_clamped_to_twelve_and_flagged_capped():
    brief = analysis.brief_from(CourseFound(modules=100, lessons=0), {})
    assert brief["modules"] == 12 and brief["lessons"] == 1 and brief["capped"] is True


def test_a_later_count_within_the_cap_clears_capped():
    brief = analysis.brief_from(CourseFound(modules=100), {})
    brief = analysis.brief_from(CourseFound(modules=6), brief)
    assert brief["modules"] == 6 and brief["capped"] is False
    brief = analysis.brief_from(CourseFound(notes="short videos"), brief)  # no count: left as it was
    assert brief["capped"] is False


def test_a_total_replaces_lessons_per_module_and_back():
    brief = analysis.brief_from(CourseFound(modules=4, lessons=3), {})
    brief = analysis.brief_from(CourseFound(total=20), brief)
    assert brief["total"] == 20 and "lessons" not in brief and brief["modules"] == 4
    brief = analysis.brief_from(CourseFound(lessons=5), brief)
    assert brief["lessons"] == 5 and "total" not in brief


def test_more_named_modules_than_the_count_raise_the_count():
    found = CourseFound(modules=3, named=[NamedModule(title=f"M{i}") for i in range(5)])
    assert analysis.brief_from(found, {})["modules"] == 5


def test_price_value_reads_amounts_free_and_membership():
    assert analysis.price_value("49") == "49.00"
    assert analysis.price_value("free") == "free"
    assert analysis.price_value("membership") == "membership"
    assert analysis.price_value("lots") is None and analysis.price_value("-5") is None


def test_a_sub_cent_price_is_free_never_paid_at_zero():
    from apps.core.focus import flow

    assert analysis.price_value("0.004") == "free"
    assert analysis.price_value("0.006") == "0.01"
    assert flow._amount("paid:0.004", "paid:") is None  # a tap never sets a paid price of 0.00


def test_brief_from_keeps_what_an_earlier_answer_settled():
    brief = analysis.brief_from(CourseFound(modules=4, notes="short videos"), {})
    brief = analysis.brief_from(CourseFound(lessons=3, notes="at the desk"), brief)
    assert (brief["modules"], brief["lessons"]) == (4, 3)
    assert brief["notes"] == "short videos at the desk"
    assert brief["analysed"] is True and brief["capped"] is False


def test_read_tells_the_model_the_question_on_screen_and_her_site(tenant_ctx):
    with (
        _model(found=CourseFound(topic="desk yoga")) as model,
        mock.patch("apps.core.focus.analysis.ai_compose.record_spend") as spend,
    ):
        found = analysis.read(
            tenant_ctx, "desk yoga", kind="course", question="Who is it for?", outline_exists=False, currency="usd"
        )
    assert found.topic == "desk yoga"
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["text"] == "desk yoga" and turn["question"] == "Who is it for?"
    assert turn["outline_exists"] is False and turn["currency"] == "usd"
    assert {"brand", "niche", "description", "her_courses"} <= set(turn)
    assert model.call_args.kwargs["label"] == "contentor:copilot"
    assert model.call_args.kwargs["output_model"] is CourseFound
    assert model.call_args.kwargs["system"] is analysis.system_for("course")
    spend.assert_called_once()


def _read(text, found=None, *, outline_exists=False, tenant):
    with _model(found=found or CourseFound()), mock.patch("apps.core.focus.analysis.ai_compose.record_spend"):
        return analysis.read(tenant, text, kind="course", question="?", outline_exists=outline_exists, currency="usd")


@pytest.mark.parametrize(
    ("text", "counts"),
    [
        ("21-day yoga course, one lesson per day", {"total": 21}),
        ("A 21 day yoga challenge for beginners", {"total": 21}),
        ("30 lessons on sourdough", {"total": 30}),
        ("8 week yoga course for back pain", {"modules": 8}),
        ("A 5-module course on pricing", {"modules": 5}),
    ],
)
def test_an_explicit_count_the_model_missed_is_read_from_her_words(tenant_ctx, text, counts):
    found = _read(text, tenant=tenant_ctx)
    assert {k: getattr(found, k) for k in ("modules", "lessons", "total") if getattr(found, k)} == counts
    brief = analysis.brief_from(found, {})
    assert {k: brief[k] for k in counts} == counts and brief["capped"] is False


@pytest.mark.parametrize(
    "text",
    [
        "yoga for 10 minute lessons",  # a length, not a count
        "around 40-50 lessons",  # a range: the model asks which
        "3 lessons a week for 8 weeks",  # a rate: not the lessons in all
        "4 modules of 3 lessons",  # both kinds: which is per module is the model's reading
        "A course on desk yoga",
    ],
)
def test_words_that_are_not_one_plain_count_are_left_to_the_model(tenant_ctx, text):
    found = _read(text, tenant=tenant_ctx)
    assert (found.modules, found.lessons, found.total) == (None, None, None)


def test_what_the_model_read_wins_over_the_digits(tenant_ctx):
    found = _read("21 days, 3 lessons a week", CourseFound(modules=3, lessons=3), tenant=tenant_ctx)
    assert (found.modules, found.lessons, found.total) == (3, 3, None)
    found = _read("a 21 day course", CourseFound(named=[NamedModule(title="Week 1")]), tenant=tenant_ctx)
    assert found.total is None  # her own titles are her outline


def test_a_count_the_model_called_unclear_is_not_read_from_the_digits(tenant_ctx):
    unclear = CourseUnclear(field="lessons", question="How many?", options=[])
    assert _read("about 20 lessons", CourseFound(unclear=[unclear]), tenant=tenant_ctx).total is None


def test_a_change_to_a_drafted_outline_is_never_a_count(tenant_ctx):
    found = _read("add 2 lessons to module 3", outline_exists=True, tenant=tenant_ctx)
    assert (found.modules, found.lessons, found.total) == (None, None, None)


def test_read_records_the_spend_of_a_failed_call_and_raises(tenant_ctx):
    with (
        _model(side_effect=core_ai.AiError("down")),
        mock.patch("apps.core.focus.analysis.ai_compose.record_spend") as spend,
        pytest.raises(core_ai.AiError),
    ):
        analysis.read(tenant_ctx, "desk yoga", kind="course", question="?", outline_exists=False, currency="usd")
    spend.assert_called_once()


# Every rule of the course prompt before the analysis learned the kinds, so the
# split into shared and per-kind rules lost none (the change rule was reworded).
THE_COURSE_RULES = (
    "- Fill only what she said. Never guess: a field she did not mention stays empty ('', null or []).",
    "- answer: her answer to 'question', in her words; '' when she said something else.",
    "- topic: what her students will learn, short, in her words.",
    "- level: 'beginners' (complete beginners), 'some' (some experience) or 'advanced' when it matches; "
    "otherwise who it is for, in her words.",
    "- modules: how many modules. lessons: how many lessons per module. total: how many lessons in all, "
    "only when she gave a total instead of a number per module.",
    "- named: the module and lesson titles she wrote, word for word and in her order. Lessons she named "
    "without a module go in one module with an empty title.",
    "- price: 'free'; 'membership' when students get it in her membership or subscription; or a plain "
    "amount in 'currency' without a sign ('49', '19.50').",
    "- notes: the rest she said about the course (its format, its promise, her angle), short, in her words.",
    "- photo: only when cover_step is true (she is choosing her course cover): a plain description of the "
    "photo she wants, in her words ('hands on a keyboard, no faces'); '' when she did not describe one.",
    "- unclear: a count, amount or level she gave vaguely ('a few modules', 'around 40-50'), or a price in a "
    "currency other than 'currency', becomes one item instead of a value: its field (modules, lessons, price "
    "or level), one short question, and 2-4 options, each a short label and its value (a number like '3', an "
    "amount like '45', 'free', or beginners | some | advanced). Leave that field itself empty.",
)


def test_the_course_prompt_is_the_same_bytes_every_call():
    system = analysis.system_for("course")
    assert system is analysis.system_for("course")  # built once: the bytes are static, so prompt caching holds
    lines = system.split("\n")
    assert [rule for rule in THE_COURSE_RULES if rule not in lines] == []
    assert (
        "- change: a change she asks for to what is drafted, in her words; only when outline_exists is true, else ''."
        in lines
    )
    assert "outline_change" not in system and "{" not in system
