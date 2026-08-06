"""The copilot endpoint pair: converse streams the turn, execute runs exactly
one confirmed action. Coach JWT auth, no metering anywhere."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.copilot import tokens as copilot_tokens

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="copilot-coach@x.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def _frames(resp):
    body = b"".join(resp.streaming_content).decode()
    return [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def test_converse_streams_phase_then_done_and_records_spend(client):
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.engine.run_turn", return_value=({"kind": "answer", "text": "hi"}, Decimal("0.02"))
        ),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend") as spend,
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {"message": "hello", "transcript": [], "selections": []},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        frames = _frames(resp)
    assert frames[0] == {"type": "phase", "phase": "thinking"}
    assert frames[-1] == {"type": "done", "kind": "answer", "text": "hi"}
    spend.assert_called_once_with("shared_test", Decimal("0.02"))


def test_converse_records_billed_cost_on_ai_error(client):
    from apps.core import ai as core_ai

    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.engine.run_turn",
            side_effect=core_ai.AiError("provider exploded", cost_usd=Decimal("0.004")),
        ),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend") as spend,
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {"message": "hello", "transcript": [], "selections": []},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        frames = _frames(resp)
    assert frames[-1] == {"type": "error"}
    spend.assert_called_once_with("shared_test", Decimal("0.004"))


def test_converse_caps_and_sanitizes_selections(client):
    oversized = [
        {"path": "/pricing", "block_id": "blk_hero", "tag": "h2", "text": "x" * 10_000, "context": "ctx", "evil": "x"}
    ] * 7
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.engine.run_turn", return_value=({"kind": "answer", "text": "hi"}, Decimal("0"))
        ) as run_turn,
        mock.patch("apps.core.copilot.views.ai_compose.record_spend"),
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {"message": "hello", "transcript": [], "selections": oversized},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        _frames(resp)
    run_turn.assert_called_once()
    sent_selections = run_turn.call_args[0][2]
    assert len(sent_selections) <= 5
    assert len(sent_selections[0]["text"]) == 200
    assert "evil" not in sent_selections[0]


def test_converse_refuses_plain_json_when_kill_switch_tripped(client):
    with mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=False):
        resp = client.post("/api/v1/admin/copilot/converse/", {"message": "hi"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"kind": "unavailable"}


def test_execute_add_block_mutates_pages(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "add_block",
            "page": "home",
            "block": {"id": "blk_new1234", "type": "cta", "enabled": True, "heading": "Join"},
            "after_block_id": "blk_hero",
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert [b["id"] for b in cfg.pages["home"]["blocks"]] == ["blk_hero", "blk_new1234"]


def test_execute_edit_block_fields_writes_cleaned_field(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "edit_block_fields", "page": "home", "block_id": "blk_hero", "fields": {"heading": "Fresh"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.pages["home"]["blocks"][0]["heading"] == "Fresh"


def test_execute_toggle_and_duplicate_block(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {
        "home": {
            "blocks": [
                {"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"},
                {"id": "blk_intro", "type": "richText", "enabled": True, "body": "Intro"},
            ]
        }
    }
    cfg.save(update_fields=["pages"])

    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "toggle_block", "page": "home", "block_id": "blk_hero", "enabled": False}
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.pages["home"]["blocks"][0]["enabled"] is False

    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "duplicate_block", "page": "home", "block_id": "blk_hero"}
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert len(cfg.pages["home"]["blocks"]) == 3  # hero + copy + intro


def test_execute_move_block_to_page(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {
        "home": {
            "blocks": [
                {"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"},
                {"id": "blk_intro", "type": "richText", "enabled": True, "body": "Intro"},
            ]
        },
        "about": {"blocks": []},
    }
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "move_block",
            "page": "home",
            "block_id": "blk_hero",
            "after_block_id": None,
            "to_page": "about",
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.pages["about"]["blocks"][0]["id"] == "blk_hero"
    assert [b["id"] for b in cfg.pages["home"]["blocks"]] == ["blk_intro"]


def test_execute_edit_navbar_links_and_show_login(client, coach):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "edit_navbar",
            "updates": {"links": [{"label": "Courses", "href": "/courses"}], "show_login": False},
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.navbar_config["links"] == [{"label": "Courses", "href": "/courses"}]
    assert cfg.navbar_config["show_login"] is False


def test_execute_edit_pages_applies_and_reports_changes(client):
    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "edit_pages", "pages": {"home": []}, "extras": {}, "changes_count": 3}
    )
    with mock.patch("apps.core.copilot.views.site_ai.apply_edit") as apply_edit:
        resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200
    assert resp.json()["result"]["changes_count"] == 3
    apply_edit.assert_called_once()


def test_execute_refuses_replay_and_garbage(client):
    token = copilot_tokens.stash_action("shared_test", {"kind": "remove_block", "page": "home", "block_id": "blk_x"})
    copilot_tokens.take_action(token, "shared_test")  # consume
    assert client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json").status_code == 403
    assert client.post("/api/v1/admin/copilot/execute/", {"token": "junk"}, format="json").status_code == 403


def test_endpoints_reject_anonymous_callers(tenant_ctx):
    anon = APIClient(HTTP_HOST=HOST)
    assert anon.post("/api/v1/admin/copilot/converse/", {}, format="json").status_code in (401, 403)
    assert anon.post("/api/v1/admin/copilot/execute/", {}, format="json").status_code in (401, 403)


def test_execute_create_course_creates_draft_and_returns_url(client, coach):
    from apps.courses.models import Course

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_course", "params": {"title": "Yoga 101", "price": "0.00", "pricing_type": "free"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    result = resp.json()["result"]
    course = Course.objects.get(id=result["id"])
    assert course.is_published is False
    assert course.instructor == coach
    assert result["url"] == f"/admin/courses/{course.slug}"


def test_execute_create_event_lands_scheduled(client, coach):
    from datetime import timedelta

    from django.utils import timezone

    from apps.live.models import LiveClass

    when = (timezone.now() + timedelta(days=3)).isoformat()
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_event", "event_kind": "live", "params": {"title": "Flow", "scheduled_at": when}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert LiveClass.objects.get(id=resp.json()["result"]["id"]).status == "scheduled"


def test_execute_create_event_onsite_dispatches_onsite_serializer(client, coach):
    from datetime import timedelta

    from django.utils import timezone

    from apps.live.models import OnsiteEvent

    when = (timezone.now() + timedelta(days=5)).isoformat()
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "create_event",
            "event_kind": "onsite",
            "params": {"title": "Retreat", "location": "Studio Mitte", "scheduled_at": when},
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    event = OnsiteEvent.objects.get(id=resp.json()["result"]["id"])
    assert event.location == "Studio Mitte"
    assert event.status == "scheduled"


def test_execute_create_blog_post_draft(client, coach):
    from apps.blog.models import BlogPost

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_blog_post", "params": {"title": "Hello", "excerpt": "hi", "body_html": "<p>x</p>"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    post = BlogPost.objects.get(id=resp.json()["result"]["id"])
    assert post.status == "draft" and post.created_by == coach


def test_execute_create_validation_failure_returns_400_detail(client):
    token = copilot_tokens.stash_action("shared_test", {"kind": "create_course", "params": {"title": ""}})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "title" in resp.json()["detail"]


def test_execute_edit_block_fields_busts_cache(client):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "edit_block_fields", "page": "home", "block_id": "blk_hero", "fields": {"heading": "Fresh"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert cache.get("tenant:shared_test:config") is None


def test_execute_edit_theme_writes_theme_flips_look_edited_and_busts_cache(client, coach):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "forest"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "edit_theme", "theme": "forest"}
    cfg = TenantConfig.objects.first()
    assert cfg.theme == "forest"
    assert cfg.setup_progress.get("look_edited") is True
    assert cache.get("tenant:shared_test:config") is None


def test_execute_edit_navbar_merges_and_preserves_links(client, coach):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"layout": "classic", "links": [{"label": "Courses", "href": "/courses"}]}
    cfg.save(update_fields=["navbar_config"])
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "edit_navbar", "updates": {"layout": "pill", "cta": {"text": "Join now", "href": "/plans"}}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.navbar_config["layout"] == "pill"
    assert cfg.navbar_config["cta"] == {"text": "Join now", "href": "/plans"}
    assert cfg.navbar_config["links"] == [{"label": "Courses", "href": "/courses"}]
    assert cache.get("tenant:shared_test:config") is None


def test_execute_edit_theme_invalid_stashed_id_returns_400(client, coach):
    # Defense in depth: even a stashed payload is re-validated at execute time.
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "midnight"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "theme must be one of" in resp.json()["detail"]


def test_execute_set_block_image_materializes_photo_and_busts_cache(client, coach):
    from django.core.cache import cache

    from apps.core.models import CuratedPhoto
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    row = CuratedPhoto.objects.create(
        title="Sunlit yoga studio",
        tags="yoga, studio",
        kind="hero",
        image_key="platform/curated-photos/sun.jpg",
    )
    cfg = TenantConfig.objects.first()
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "set_block_image",
            "page": "home",
            "block_id": "blk_hero",
            "field": "bgImage",
            "curated_photo_id": row.pk,
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "set_block_image", "page": "home"}
    photo = Photo.objects.get(s3_key="platform/curated-photos/sun.jpg")
    cfg.refresh_from_db()
    block = cfg.pages["home"]["blocks"][0]
    assert block["bgImage"] == {"url": None, "photo_id": str(photo.pk)}
    assert block["heading"] == "Hi"
    assert cache.get("tenant:shared_test:config") is None


def test_execute_set_block_image_gone_catalog_row_returns_400(client, coach):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True}]}}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "set_block_image",
            "page": "home",
            "block_id": "blk_hero",
            "field": "bgImage",
            "curated_photo_id": 999999,
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "no longer available" in resp.json()["detail"]


def test_execute_set_course_cover_materializes_photo_and_sets_thumbnail(client, coach):
    from apps.core.models import CuratedPhoto
    from apps.courses.models import Course
    from apps.media.models import Photo

    row = CuratedPhoto.objects.create(
        title="Golden-hour mat flow",
        tags="yoga, flow",
        kind="hero",
        image_key="platform/curated-photos/mat.jpg",
    )
    course = Course.objects.create(title="Yoga Basics", instructor=coach)
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "set_course_cover", "course_id": course.pk, "curated_photo_id": row.pk},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {
        "kind": "set_course_cover",
        "id": course.pk,
        "title": "Yoga Basics",
        "url": f"/admin/courses/{course.slug}",
    }
    course.refresh_from_db()
    photo = Photo.objects.get(s3_key="platform/curated-photos/mat.jpg")
    assert course.thumbnail_id == photo.pk


def test_execute_set_course_cover_gone_course_returns_400(client, coach):
    from apps.core.models import CuratedPhoto

    row = CuratedPhoto.objects.create(
        title="Golden-hour mat flow",
        tags="yoga",
        kind="hero",
        image_key="platform/curated-photos/mat2.jpg",
    )
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "set_course_cover", "course_id": 999999, "curated_photo_id": row.pk},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "no longer exists" in resp.json()["detail"]


def test_execute_records_audit_row(client, coach):
    from apps.tenant_config.models import CopilotAudit, TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "edit_block_fields", "page": "home", "block_id": "blk_hero", "fields": {"heading": "New"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    row = CopilotAudit.objects.latest("created_at")
    assert row.kind == "edit_block_fields"
    assert row.summary == "Edited 1 field(s) on blk_hero (home)"
    assert row.payload["fields"] == {"heading": "New"}
    assert row.actor_id == coach.pk


def test_audit_write_failure_never_fails_the_execute(client, coach, monkeypatch):
    from unittest import mock

    from apps.core.copilot import views as copilot_views
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "toggle_block", "page": "home", "block_id": "blk_hero", "enabled": False},
    )
    with mock.patch.object(copilot_views, "_audit_summary", side_effect=RuntimeError("boom")):
        resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.pages["home"]["blocks"][0]["enabled"] is False


def test_audit_feed_returns_entries_newest_first(client, coach):
    from apps.tenant_config.models import CopilotAudit

    CopilotAudit.objects.create(kind="edit_theme", summary="Switched theme to forest")
    CopilotAudit.objects.create(kind="add_block", summary="Added a faq section to home")
    resp = client.get("/api/v1/admin/copilot/audit/")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert [e["summary"] for e in entries[:2]] == [
        "Added a faq section to home",
        "Switched theme to forest",
    ]
    assert entries[0]["kind"] == "add_block" and "created_at" in entries[0]
