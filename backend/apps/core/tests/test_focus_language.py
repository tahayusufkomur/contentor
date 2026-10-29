"""Focus mode's fixed copy follows the creator's language; what it writes on the site follows the site's."""

from unittest import mock

import pytest
from django.db import transaction
from django.utils import translation
from django.utils.translation import ngettext

from apps.accounts.models import User
from apps.core import tasks
from apps.core.focus import flow, kinds
from apps.core.focus.kinds import course as course_kind
from apps.core.focus.kinds import membership, post
from apps.core.tests.i18n_utils import gettext_in, translated
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="focus-lang@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
        preferred_locale="tr",
    )


@pytest.fixture(autouse=True)
def no_celery():
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


@pytest.fixture()
def outline_start():
    def fake(creation, instruction=""):
        run = CopilotRun.objects.create(
            actor=creation.actor, chat=creation.chat, specialist="content", request={"instruction": instruction}
        )
        creation.outline_run = run
        creation.save(update_fields=["outline_run"])
        return run

    with mock.patch("apps.core.focus.outline.start", side_effect=fake):
        yield


def _site(locale):
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale=locale)


def test_a_question_and_its_tiles_are_in_the_request_language(tenant_ctx):
    with translation.override("tr"):
        asked = flow.question("course", "level")
        size = flow.question("course", "size")
    assert asked["question"] == translated("Who is it for?")
    assert asked["why"] == translated("It sets the pace, and the words the lessons use.")
    assert [o["label"] for o in asked["options"]] == [
        translated(t) for t in ("Complete beginners", "Some experience", "Advanced")
    ]
    assert [o["value"] for o in asked["options"]] == ["beginners", "some", "advanced"]  # identity never changes
    assert size["options"][0]["hint"] == translated("1 module · 3–4 lessons")


def test_the_answered_lines_and_the_finish_copy_are_in_the_creators_language(owner, outline_start):
    with translation.override("tr"):
        creation = flow.start(owner, "course", text="A course on desk yoga")
        creation = flow.answer(creation, "level", rest=True)  # "Just draft it": You decide, for the rest
        creation = flow.answer(creation, "outline_review", value="ok")
        creation.answers = {**creation.answers, "cover": "later", "access": "free"}
        creation.save()
        lines = {a["field"]: a["label"] for a in flow.state(creation)["answered"]}
        creation = flow.finish(creation, publish=False)
    decided = translated("%(label)s: you decide") % {"label": translated("Who it is for")}
    assert lines["level"] == decided
    assert lines["outline_review"] == translated("Looks good")
    assert lines["cover"] == translated("Later")
    chat = CopilotChat.objects.get(pk=creation.chat_id).entries
    assert chat[-1]["text"] == translated(
        "Saved as a draft. Once every lesson has its video or text, publish it from this page."
    )
    assert {"role": "coach", "text": translated("Keep as a draft")} in chat
    assert {"role": "coach", "text": translated("You decide")} in chat
    assert creation.answers["finish"] == "draft"  # the stored answer is the code, not the words


def test_a_size_is_recorded_in_english_and_shown_in_the_active_language():
    brief = {"modules": 4, "lessons": 3}
    with translation.override("tr"):
        assert flow.size_label(brief) == "4 modules · 3 lessons each"  # the outline job reads it
        shown = flow._label(course_kind.RECIPE, course_kind.RECIPE.questions[2], "4 modules · 3 lessons each")
        total = flow._label(course_kind.RECIPE, course_kind.RECIPE.questions[2], "12 lessons")
        her_words = flow._label(course_kind.RECIPE, course_kind.RECIPE.questions[2], "a quick one")
        modules = ngettext("%(n)d module", "%(n)d modules", 4) % {"n": 4}
        lessons = ngettext("%(n)d lesson each", "%(n)d lessons each", 3) % {"n": 3}
        twelve = ngettext("%(n)d lesson", "%(n)d lessons", 12) % {"n": 12}
    assert modules != "4 modules", "tr has no translation: run make translate"
    assert shown == f"{modules} · {lessons}"
    assert total == twelve
    assert her_words == "a quick one"


def test_a_followup_decided_for_her_is_a_flag_in_code_and_english_for_the_model(owner, outline_start):
    creation = FocusCreation.objects.create(
        kind="course",
        actor=owner,
        chat=CopilotChat.objects.create(actor=owner, title="x"),
        brief={"followup": {"question": "Soru?", "options": ["A"], "slot": "later"}},
    )
    with translation.override("tr"), transaction.atomic():
        assert flow._followup_answered(creation, None, "", True, False)
    entry = creation.brief["followups"][0]
    assert entry["answer"] == "You decide" and flow.decided(entry)
    assert CopilotChat.objects.get(pk=creation.chat_id).entries[-1] == {
        "role": "coach",
        "text": translated("You decide"),
    }
    assert flow.decided({"question": "q", "answer": "You decide"})  # stored before the flag
    assert not flow.decided({"question": "q", "answer": "Evet"})


def test_a_draft_title_is_in_the_site_language_not_the_creators(tenant_ctx):
    _site("tr")
    with translation.override("de"):
        assert flow.working_title("", "course") == gettext_in("New course", "tr")
        assert kinds.new_title("bundle") == gettext_in("New bundle", "tr")
        assert kinds.new_titles("post") == (gettext_in("New post", "tr"), "New post")
    assert gettext_in("New course", "tr") != "New course"


def test_a_post_draft_at_its_placeholder_address_is_known_in_both_languages(tenant_ctx):
    from apps.core.slugs import slugify

    _site("tr")
    assert post.placeholder().fullmatch("new-post-2")
    assert post.placeholder().fullmatch(slugify(gettext_in("New post", "tr")))
    assert not post.placeholder().fullmatch("my-first-post")


def test_her_own_words_lower_case_with_the_language_she_writes_in(tenant_ctx):
    choices = [
        {"value": "course:1", "label": "İstanbul Yoga", "hint": ""},
        {"value": "course:2", "label": "Iğdır Flow"},
    ]
    with translation.override("tr"):
        assert membership._named(["istanbul yoga", "ığdır flow"], choices) == ["course:1", "course:2"]
    with translation.override("en"):
        assert membership._named(["istanbul yoga"], choices) == []  # English lower() makes "i̇stanbul": not hers


def test_the_pricing_reasons_and_the_refusal_line_are_in_the_creators_language(tenant_ctx):
    with translation.override("tr"):
        line = membership.refused_line(["A", "B", "C", "D", "E"], [])
    names = translated("%(items)s and %(last)s") % {"items": "A, B, C", "last": translated("%(n)d more") % {"n": 2}}
    assert line == translated("%(names)s could not be added.") % {"names": names}


def test_the_seeded_pages_are_in_the_site_language(tenant_ctx):
    from apps.core.demo import seed_template
    from apps.tenant_config.models import TenantConfig

    _site("tr")
    with translation.override("en"):
        seed_template._merge_config(tenant_ctx, {}, {})
    pages = str(TenantConfig.objects.first().pages)
    assert gettext_in("Get in touch", "tr") in pages
    assert "Get in touch" not in pages


def test_a_tier_tile_shows_the_creators_words_and_names_the_plan_in_the_site_language(tenant_ctx, owner):
    from apps.courses.models import Course

    _site("de")
    Course.objects.create(title="Yoga", instructor=owner, is_published=True)
    with translation.override("tr"):
        tile = membership.topic_tiles()[0]
    assert tile["label"] == translated("Digital membership")
    assert tile["value"] == gettext_in("Digital membership", "de")  # the plan's name: students read it
    assert tile["hint"] == translated("All the pre-recorded content, watched any time.")
