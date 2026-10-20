"""The covers job: once the outline is written, the Designer drafts four cover
styles sharing one photo (hers first, else a library match copied into her
Media), with fixed styles when the model fails. The model and the library are
patched; what is under test is the round written, the photo, and the fallback."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.curated_images import client
from apps.core.curated_images.cache import tenant_key_for
from apps.core.focus import covers, flow, jobs, outline
from apps.core.focus.kinds.course import CourseFound
from apps.courses.models import Course
from apps.media.models import Design, Photo
from apps.tenant_config.models import CopilotAudit, CopilotChat, CopilotRun, FocusCreation
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


def test_a_photo_query_she_said_while_the_first_round_drew_survives(outlined, plan, library):
    drawn = plan.side_effect

    def she_speaks_meanwhile(**kwargs):  # her analysis lands between the job's start and its locked write
        result = drawn(**kwargs)
        found = CourseFound(photo="hands on a keyboard, no faces")
        creation = FocusCreation.objects.get(pk=outlined.pk)
        creation.pending = {"field": "cover", "text": "hands on a keyboard, no faces"}
        flow.apply(creation, found)
        creation.save()
        return result

    plan.side_effect = she_speaks_meanwhile
    creation = _draw(outlined)
    assert creation.covers["query"] == "hands on a keyboard, no faces"
    assert len(creation.covers["rounds"]) == 1


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


# --- the cover's actions and its photo row --------------------------------

HOST = "shared-test.localhost"
on = override_settings(FOCUS_MODE_ENABLED=True)


@pytest.fixture()
def hers(owner):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=owner)
    return c


@pytest.fixture()
def at_cover(outlined, plan, library):
    """Four drafts drawn, the titles confirmed: the cover question is on screen."""
    creation = flow.answer(_draw(outlined), "outline_review", value="ok")
    assert flow.current_field(creation) == "cover"
    return creation


def _act(client, creation, **body):
    return client.post(f"/api/v1/admin/focus/{creation.id}/cover/", body, format="json")


def _mine(name="desk"):
    return Photo.objects.create(
        s3_key=f"tenants/shared-test/photo/{name}.avif", title=name, index_status="ready", width=1600, height=900
    )


def _round(creation):
    creation.refresh_from_db()
    return creation.covers["rounds"][-1]


@on
def test_tapping_a_photo_puts_it_into_every_photo_style(at_cover, hers):
    mine = _mine("lake")
    response = _act(hers, at_cover, action="photo", asset_id=f"own:{mine.pk}")
    assert response.status_code == 200
    round_ = _round(at_cover)
    assert at_cover.covers["photo"] == str(mine.pk)
    assert {r["layout"]: r["photo"]["id"] for r in round_} == {
        "panel": str(mine.pk),
        "full": str(mine.pk),
        "title": None,
        "band": str(mine.pk),
    }
    assert response.json()["cover"]["photo"]["id"] == str(mine.pk)


@on
def test_a_library_photo_is_copied_into_her_media_when_tapped(at_cover, hers, library):
    other = client.RemoteImage("lib-2", "Lake", "A lake", [], 1600, 900, "", "")
    with mock.patch.object(client, "get", return_value=other) as get:
        response = _act(hers, at_cover, action="photo", asset_id="lib-2")
    assert response.status_code == 200
    get.assert_called_once_with("lib-2")
    copied = Photo.objects.get(s3_key=tenant_key_for("lib-2"))
    assert _round(at_cover)[0]["photo"]["id"] == str(copied.pk)


@on
def test_a_photo_that_cannot_be_had_changes_nothing(at_cover, hers):
    before = _round(at_cover)
    with mock.patch.object(client, "get", side_effect=client.CuratedImageError("down")):
        assert _act(hers, at_cover, action="photo", asset_id="lib-2").status_code == 409
    with mock.patch.object(client, "get", return_value=None):
        assert _act(hers, at_cover, action="photo", asset_id="lib-3").status_code == 409
    assert _act(hers, at_cover, action="photo", asset_id="own:not-a-uuid").status_code == 409
    # Storage or the network failing on the copy: she is told, never a 500.
    other = client.RemoteImage("lib-4", "Lake", "A lake", [], 1600, 900, "", "")
    with (
        mock.patch.object(client, "get", return_value=other),
        mock.patch("apps.core.focus.covers.cache.cache_remote_image", side_effect=OSError("storage down")),
    ):
        assert _act(hers, at_cover, action="photo", asset_id="lib-4").status_code == 409
    assert _round(at_cover) == before


def test_only_a_plain_asset_id_is_ever_fetched():
    with mock.patch.object(client, "get") as get:
        for bad in ("lib-2?size=full", "lib 2", "../lib", "%2e%2e", "x" * 129, "", None, 7):
            assert covers.photo_for(bad) is None
    get.assert_not_called()


@on
def test_use_this_cover_keeps_it_with_an_undo(at_cover, hers):
    mine = _mine("lake")
    _act(hers, at_cover, action="photo", asset_id=f"own:{mine.pk}")
    response = _act(hers, at_cover, action="keep", index=1)
    assert response.json()["question"]["field"] == "finish"
    course = Course.objects.get(pk=at_cover.record_id)
    assert str(course.thumbnail_id) == str(mine.pk)
    design = Design.objects.get(target_kind="course", target_key=str(course.pk), state="kept")
    assert design.made_by == "designer" and design.recipe["layout"] == "full"
    audit = CopilotAudit.objects.get(kind="keep_cover", payload__design_id=str(design.pk))
    assert audit.payload["made_by"] == "designer"
    assert audit.inverse["kind"] == "restore_cover_design"
    at_cover.refresh_from_db()
    assert {"field": "cover", "label": "Cover chosen"} in flow.state(at_cover)["answered"]


@on
def test_a_failed_audit_write_never_undoes_use_this_cover(at_cover, hers):
    from django.db import connection, transaction

    def broken(**_kwargs):  # a database error inside the write, as Model.save meets one
        with transaction.mark_for_rollback_on_error(), connection.cursor() as cursor:
            cursor.execute("SELECT 1 / 0")

    with mock.patch.object(CopilotAudit.objects, "create", side_effect=broken):
        response = _act(hers, at_cover, action="keep", index=0)
    assert response.status_code == 200
    assert response.json()["question"]["field"] == "finish"
    assert Design.objects.filter(kind="cover", target_key=str(at_cover.record_id), state="kept").exists()


@on
def test_use_this_cover_twice_keeps_once(at_cover, hers):
    _act(hers, at_cover, action="keep", index=0)
    _act(hers, at_cover, action="keep", index=2)
    kept = Design.objects.get(kind="cover", target_key=str(at_cover.record_id), state="kept")
    assert kept.recipe["layout"] == "panel"
    assert CopilotAudit.objects.filter(kind="keep_cover", payload__design_id=str(kept.pk)).count() == 1
    assert Design.objects.filter(kind="cover", target_key=str(at_cover.record_id)).count() == 1


@on
def test_keeping_replaces_an_older_draft_with_the_style_she_chose(at_cover, hers):
    older = Design.objects.create(
        target_kind="course",
        target_key=str(at_cover.record_id),
        recipe=_round(at_cover)[3],
        made_by="coach",
    )
    _act(hers, at_cover, action="keep", index=0)
    kept = Design.objects.get(pk=older.pk)
    assert kept.state == "kept" and kept.recipe["layout"] == "panel" and kept.made_by == "designer"


@on
def test_a_bad_index_keeps_nothing(at_cover, hers):
    for index in (-1, 4, "x", None):
        _act(hers, at_cover, action="keep", index=index)
    assert not Design.objects.filter(kind="cover").exists()
    assert flow.current_field(FocusCreation.objects.get(pk=at_cover.pk)) == "cover"


@on
def test_later_leaves_it_without_a_cover(at_cover, hers):
    response = _act(hers, at_cover, action="later")
    assert response.json()["question"]["field"] == "finish"
    assert FocusCreation.objects.get(pk=at_cover.pk).answers["cover"] == "later"
    at_cover.refresh_from_db()
    assert {"field": "cover", "label": "Later"} in flow.state(at_cover)["answered"]
    assert not Design.objects.filter(kind="cover").exists()


@on
def test_more_drafts_another_round_and_not_while_one_is_building(at_cover, hers):
    assert _act(hers, at_cover, action="more").json()["cover"]["status"] == "building"
    queued = CopilotRun.objects.get(pk=FocusCreation.objects.get(pk=at_cover.pk).runs["covers"])
    assert queued.request["ahead"] is False
    _act(hers, at_cover, action="more")  # tapped again while building
    assert CopilotRun.objects.filter(request__job="covers").count() == 2


@on
def test_the_actions_refuse_when_the_cover_is_not_the_question(outlined, hers):
    _act(hers, outlined, action="later")
    assert "cover" not in FocusCreation.objects.get(pk=outlined.pk).answers
    assert _act(hers, outlined, action="keep", index=0).status_code == 200
    assert not Design.objects.filter(kind="cover").exists()


@on
def test_edit_opens_the_studio_on_that_style(at_cover, hers):
    response = _act(hers, at_cover, action="edit", index=2)
    design = Design.objects.get(target_kind="course", target_key=str(at_cover.record_id), state="draft")
    assert response.json()["design_id"] == str(design.pk) and design.recipe["layout"] == "title"
    assert response.json()["question"]["field"] == "cover"  # still hers to finish
    again = _act(hers, at_cover, action="edit", index=0)
    assert again.json()["design_id"] == str(design.pk)
    design.refresh_from_db()
    assert design.recipe["layout"] == "panel"


@on
def test_an_unknown_action_changes_nothing(at_cover, hers):
    assert _act(hers, at_cover, action="explode").status_code == 200
    assert _act(hers, at_cover).status_code == 200


@on
def test_the_photo_row_lists_hers_first_then_the_library(at_cover, hers, library):
    mine = _mine("lake")
    body = hers.get(f"/api/v1/admin/focus/{at_cover.id}/photos/?q=lakes").json()
    assert [r["asset_id"] for r in body["results"]] == [f"own:{mine.pk}", "lib-1"]
    assert [r["mine"] for r in body["results"]] == [True, False]
    assert body["results"][1]["title"] == "Desk" and body["results"][1]["url"] == ""
    assert body["has_next"] is False
    library.assert_called_with("lakes", orientation=client.WIDE, page=1)


@on
def test_the_photo_row_defaults_to_the_covers_query_and_pages_the_library_only(at_cover, hers, library):
    _mine("lake")
    hers.get(f"/api/v1/admin/focus/{at_cover.id}/photos/")
    library.assert_called_with("desk stretch", orientation=client.WIDE, page=1)  # covers.query
    body = hers.get(f"/api/v1/admin/focus/{at_cover.id}/photos/?page=2").json()
    assert [r["asset_id"] for r in body["results"]] == ["lib-1"]
    library.assert_called_with("desk stretch", orientation=client.WIDE, page=2)


@on
def test_the_photo_row_survives_the_library_being_down(at_cover, hers, library):
    mine = _mine("lake")
    library.side_effect = client.CuratedImageError("down")
    response = hers.get(f"/api/v1/admin/focus/{at_cover.id}/photos/?q=lakes")
    assert response.status_code == 200
    assert [r["asset_id"] for r in response.json()["results"]] == [f"own:{mine.pk}"]
    assert response.json()["has_next"] is False


@on
def test_a_course_deleted_after_the_drawing_began_ends_it_quietly(outlined, plan, library):
    def gone(query):
        Course.objects.filter(pk=outlined.record_id).delete()

    with mock.patch("apps.core.focus.covers.pick_photo", side_effect=gone):
        creation = _draw(outlined)
    assert not (creation.covers or {}).get("rounds")
    assert CopilotRun.objects.get(pk=creation.runs["covers"]).status == "done"


@on
def test_a_photo_she_chose_while_the_first_round_drew_is_kept(outlined, plan, library):
    mine = _mine("lake")

    def chosen(query):
        FocusCreation.objects.filter(pk=outlined.pk).update(covers={"photo": str(mine.pk)})
        return _mine("other")

    with mock.patch("apps.core.focus.covers.pick_photo", side_effect=chosen):
        creation = _draw(outlined)
    assert creation.covers["photo"] == str(mine.pk)
    assert creation.covers["rounds"][0][0]["photo"]["id"] == str(mine.pk)


# --- a photo cover (a post's, G7): the photo row only, no styles ------------


@pytest.fixture()
def post_at_cover(owner, settings):
    """A post at its cover step: her topic and length answered, the post looked at."""
    from apps.blog.models import BlogPost

    settings.FOCUS_KINDS = ["course", "post"]
    creation = flow.start(owner, "post", value="Breathing before class")
    FocusCreation.objects.filter(pk=creation.pk).update(answers={**creation.answers, "length": "short", "review": "ok"})
    BlogPost.objects.filter(pk=creation.record_id).update(excerpt="Three breaths that settle a room.")
    creation.refresh_from_db()
    assert flow.current_field(creation) == "cover"
    return creation


@on
def test_the_post_cover_step_shows_photos_not_styles(post_at_cover, hers, library):
    asked = flow.state(post_at_cover)["question"]
    assert (asked["field"], asked["kind"], asked["specialist"]) == ("cover", "cover", "designer")
    # No styles are ever drafted: the step is the photo row, searched for the post.
    assert flow.state(post_at_cover)["cover"] == {
        "status": "ready",
        "run": None,
        "round": 0,
        "drafts": [],
        "photo": None,
        "query": "",
    }
    assert covers.start(post_at_cover, ahead=False) is None
    _act(hers, post_at_cover, action="more")
    assert "covers" not in (FocusCreation.objects.get(pk=post_at_cover.pk).runs or {})
    mine = _mine("mat")
    body = hers.get(f"/api/v1/admin/focus/{post_at_cover.id}/photos/?q=mats").json()
    assert [r["asset_id"] for r in body["results"]] == [f"own:{mine.pk}", "lib-1"]
    # Her words for the photo ("say it") are the row's search.
    with mock.patch("apps.core.focus.flow.ai_compose.compose_available", return_value=False):
        flow.answer(post_at_cover, "cover", text="hands on a yoga mat")
    post_at_cover.refresh_from_db()
    assert flow.state(post_at_cover)["cover"]["query"] == "hands on a yoga mat"
    assert flow.current_field(post_at_cover) == "cover"


@on
def test_use_this_photo_sets_the_cover_photo_once(post_at_cover, hers, library):
    from apps.blog.models import BlogPost

    other = client.RemoteImage("lib-2", "Mat", "A yoga mat", [], 1600, 900, "", "")
    with mock.patch.object(client, "get", return_value=other):
        response = _act(hers, post_at_cover, action="use", asset_id="lib-2")
    assert response.status_code == 200
    copied = Photo.objects.get(s3_key=tenant_key_for("lib-2"))  # a library pick, copied into her Media first
    assert BlogPost.objects.get(pk=post_at_cover.record_id).cover_photo_id == copied.pk
    assert response.json()["question"]["field"] == "finish"
    assert {"field": "cover", "label": "Cover chosen"} in response.json()["answered"]
    # A double tap keeps once: the cover stays the first photo.
    mine = _mine("lake")
    assert _act(hers, post_at_cover, action="use", asset_id=f"own:{mine.pk}").status_code == 200
    assert BlogPost.objects.get(pk=post_at_cover.record_id).cover_photo_id == copied.pk
    chat = CopilotChat.objects.get(pk=post_at_cover.chat_id).entries
    assert sum(1 for e in chat if e["text"] == "Cover chosen") == 1
    assert not Design.objects.exists()  # a photo, not a styled cover


@on
def test_use_this_photo_is_only_a_photo_covers_tap(at_cover, hers):
    mine = _mine("lake")
    _act(hers, at_cover, action="use", asset_id=f"own:{mine.pk}")
    assert flow.current_field(FocusCreation.objects.get(pk=at_cover.pk)) == "cover"  # a course keeps a style
    assert Course.objects.get(pk=at_cover.record_id).thumbnail_id is None
