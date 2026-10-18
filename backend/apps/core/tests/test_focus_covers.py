"""The covers job: once the outline is written, the Designer drafts four cover
styles sharing one photo (hers first, else a library match copied into her
Media), with fixed styles when the model fails. The model and the library are
patched; what is under test is the round written, the photo, and the fallback."""

import json
from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.curated_images import client
from apps.core.curated_images.cache import tenant_key_for
from apps.core.focus import covers, flow, jobs, outline
from apps.courses.models import Course
from apps.media.models import Photo
from apps.tenant_config.models import CopilotRun
from apps.tenant_config.setup_flow import _Module

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="covers-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def enqueue():
    with mock.patch.object(tasks.run_focus_job, "delay") as delay:
        yield delay


@pytest.fixture(autouse=True)
def ai_on():
    with (
        mock.patch("apps.core.focus.outline.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.outline.ai_compose.record_spend"),
        mock.patch("apps.core.focus.analysis.read", side_effect=core_ai.AiError("off")),
    ):
        yield


@pytest.fixture()
def library():
    """The library, patched: one wide match, copied into her Media without a download."""
    image = client.RemoteImage("lib-1", "Desk", "A desk by a window", [], 1600, 900, "", "")

    def copy(remote, **_kwargs):
        return Photo.objects.get_or_create(s3_key=tenant_key_for(remote.asset_id), defaults={"title": remote.title})[0]

    with (
        mock.patch.object(client, "search", return_value=client.SearchPage(results=[image], page=1, has_next=False)),
        mock.patch("apps.core.focus.covers.cache.cache_remote_image", side_effect=copy),
    ):
        yield client.search


def _style(layout, **kwargs):
    return covers.CoverStyle(
        layout=layout, panel="accent", title_font="body", upper=True, subtitle="Loosen up at your desk", **kwargs
    )


@pytest.fixture()
def plan():
    """The model, patched: a plan with four styles. ``plan.calls`` holds each user turn."""

    def fake(**kwargs):
        fake.calls.append(json.loads(kwargs["user"]))
        styles = [_style(layout) for layout in ("panel", "full", "title", "band")]
        return covers.CoverPlan(photo_query="desk stretch", styles=styles), Decimal("0"), "x"

    fake.calls = []
    with mock.patch("apps.core.focus.covers.core_ai.structured", side_effect=fake) as model:
        model.calls = fake.calls
        yield model


@pytest.fixture()
def outlined(owner):
    """The first outline written: its covers run is queued."""
    draft = outline.OutlineDraft(
        title="Desk yoga, gently",
        description="For office workers.",
        modules=[_Module(title="Module 1", lessons=["Lesson 1.1"])],
    )
    creation = flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)
    with mock.patch("apps.core.focus.outline.core_ai.structured", return_value=(draft, Decimal("0"), "x")):
        jobs.execute(SCHEMA, creation.outline_run_id)
    creation.refresh_from_db()
    return creation


def _draw(creation):
    jobs.execute(SCHEMA, creation.runs["covers"])
    creation.refresh_from_db()
    return creation


def test_the_first_outline_starts_the_covers_ahead(outlined):
    run = CopilotRun.objects.get(pk=outlined.runs["covers"])
    assert run.specialist == "designer"
    assert run.request == {"focus": outlined.id, "job": "covers", "ahead": True}
    assert flow.state(outlined)["cover"]["status"] == "building"


def test_a_round_is_four_validated_recipes_sharing_one_photo(outlined, plan, library):
    creation = _draw(outlined)
    round_ = creation.covers["rounds"][-1]
    assert [r["layout"] for r in round_] == ["panel", "full", "title", "band"]
    photo = creation.covers["photo"]
    assert photo == str(Photo.objects.get(s3_key=tenant_key_for("lib-1")).pk)
    for recipe in round_:
        assert recipe["version"] == 1
        assert recipe["photo"]["id"] == (None if recipe["layout"] == "title" else photo)
        assert recipe["words"]["subtitle"] == "Loosen up at your desk"
        assert recipe["styles"]["title"] == {"font": "body", "upper": True}
    library.assert_called_once_with("desk stretch", orientation=client.WIDE)
    assert plan.calls[0]["course"] == "Desk yoga, gently"
    assert plan.calls[0]["earlier_layouts"] == []
    run = CopilotRun.objects.get(pk=creation.runs["covers"])
    assert run.status == "done"
    steps = list(run.events.filter(type="step").values_list("data", flat=True))
    assert [s["state"] for s in steps] == ["start", "done"]
    assert steps[0]["specialist"] == "designer" and steps[0]["label"] == "Drafting covers"
    cover = flow.state(creation)["cover"]
    assert cover["status"] == "ready" and cover["round"] == 1 and cover["query"] == "desk stretch"
    assert [d["id"] for d in cover["drafts"]] == ["d0", "d1", "d2", "d3"]
    assert cover["drafts"][0]["recipe"] == round_[0]
    assert set(cover["drafts"][0]["photos"]) == {photo} and cover["photo"]["id"] == photo
    assert {"logo_url", "look"} <= set(cover["drafts"][0])


def test_her_own_photo_comes_before_the_library(outlined, plan, library):
    mine = Photo.objects.create(
        s3_key="tenants/shared-test/photo/desk.avif", title="desk", index_status="ready", width=1600, height=900
    )
    creation = _draw(outlined)
    assert creation.covers["photo"] == str(mine.pk)
    library.assert_not_called()


def test_a_failed_draft_falls_back_to_fixed_styles(outlined, library):
    with mock.patch("apps.core.focus.covers.core_ai.structured", side_effect=core_ai.AiError("down")):
        creation = _draw(outlined)
    round_ = creation.covers["rounds"][-1]
    assert [r["layout"] for r in round_] == ["full", "panel", "title", "band"]
    assert all(r["panel"] == "primary" and r["words"]["subtitle"] == "" for r in round_)
    assert creation.covers["photo"] is not None
    assert CopilotRun.objects.get(pk=creation.runs["covers"]).status == "done"


def test_four_more_styles_avoids_the_layouts_already_shown(outlined, plan, library):
    creation = _draw(outlined)
    first_photo = creation.covers["photo"]
    covers.start(creation, ahead=False)
    creation = _draw(creation)
    assert plan.calls[1]["earlier_layouts"] == ["panel", "full", "title", "band"]
    assert CopilotRun.objects.get(pk=creation.runs["covers"]).request["ahead"] is False
    assert creation.covers["photo"] == first_photo  # later rounds keep the photo
    with mock.patch("apps.core.focus.covers.core_ai.structured", side_effect=core_ai.AiError("down")):
        covers.start(creation, ahead=False)
        creation = _draw(creation)
    assert [r["layout"] for r in creation.covers["rounds"][-1]] == ["full", "panel", "title", "band"]  # round 3
    assert len(creation.covers["rounds"]) == 3
    library.assert_called_once()


def test_the_fallback_second_round_uses_the_other_layouts(outlined, library):
    with mock.patch("apps.core.focus.covers.core_ai.structured", side_effect=core_ai.AiError("down")):
        creation = _draw(outlined)
        covers.start(creation, ahead=False)
        creation = _draw(creation)
    assert [r["layout"] for r in creation.covers["rounds"][-1]] == ["framed", "photo", "panel", "full"]


def test_fewer_than_four_distinct_layouts_are_filled_from_the_fallback(outlined, library):
    styles = [_style("band"), _style("band"), _style("title")]
    with mock.patch(
        "apps.core.focus.covers.core_ai.structured",
        return_value=(covers.CoverPlan(photo_query="desk", styles=styles), Decimal("0"), "x"),
    ):
        creation = _draw(outlined)
    assert [r["layout"] for r in creation.covers["rounds"][-1]] == ["band", "title", "full", "panel"]


def test_a_course_deleted_meanwhile_ends_the_drafting_quietly(outlined, plan, library):
    Course.objects.filter(pk=outlined.record_id).delete()
    creation = _draw(outlined)
    assert not (creation.covers or {}).get("rounds")
    assert CopilotRun.objects.get(pk=creation.runs["covers"]).status == "done"
    assert plan.calls == []


def test_a_redraft_does_not_start_the_covers_again(outlined):
    first = outlined.runs["covers"]
    CopilotRun.objects.filter(pk=first).update(status="done")  # drawn: only a first write starts one
    draft = outline.OutlineDraft(title="Desk yoga", description="", modules=[_Module(title="M", lessons=["L"])])
    run = outline.start(outlined, instruction="Shorter")
    with mock.patch("apps.core.focus.outline.core_ai.structured", return_value=(draft, Decimal("0"), "x")):
        jobs.execute(SCHEMA, run.id)
    outlined.refresh_from_db()
    assert CopilotRun.objects.get(pk=run.id).status == "done"
    assert outlined.runs["covers"] == first


def test_payload_is_none_before_any_covers_job(owner):
    creation = flow.start(owner, "course", value="A course on desk yoga")
    assert flow.state(creation)["cover"] is None
