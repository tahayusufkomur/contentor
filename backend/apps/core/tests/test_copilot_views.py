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

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
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
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "midnight"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "theme must be one of" in resp.json()["detail"]


def test_execute_edit_seo_writes_meta_description_and_busts_cache(client, coach):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_seo", "meta_description": "Better Google text"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "edit_seo"}
    cfg.refresh_from_db()
    assert cfg.meta_description == "Better Google text"
    assert cache.get("tenant:shared_test:config") is None


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
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
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

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
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


def test_execute_set_course_cover_with_prior_thumbnail_records_audit_and_undo_restores_it(client, coach):
    """Regression for Finding 6: course.thumbnail_id is a Photo UUID pk.
    Before the fix, capturing it raw into the inverse dict broke JSON
    serialization on audit write — the execute still returned 200 but
    _record_audit's best-effort except silently swallowed the failure,
    so NO audit row (and therefore no undo) was ever created for this case."""
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.core.models import CuratedPhoto
    from apps.courses.models import Course
    from apps.media.models import Photo
    from apps.tenant_config.models import CopilotAudit

    old_row = CuratedPhoto.objects.create(
        title="Old cover", tags="yoga", kind="hero", image_key="platform/curated-photos/prior-cover.jpg"
    )
    old_thumbnail = materialize_curated_photo(old_row)
    course = Course.objects.create(title="Yoga Basics", instructor=coach, thumbnail=old_thumbnail)

    new_row = CuratedPhoto.objects.create(
        title="Golden-hour mat flow", tags="yoga, flow", kind="hero", image_key="platform/curated-photos/new-cover.jpg"
    )
    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "set_course_cover", "course_id": course.pk, "curated_photo_id": new_row.pk}
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    audit_id = resp.json()["audit_id"]
    assert audit_id is not None  # the audit row must exist at all

    row = CopilotAudit.objects.get(pk=audit_id)
    assert row.inverse["kind"] == "restore_course_cover"
    assert row.inverse["thumbnail_id"] == str(old_thumbnail.pk)
    assert isinstance(row.inverse["thumbnail_id"], str)

    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit_id}, format="json")
    assert undo.status_code == 200, undo.content
    course.refresh_from_db()
    assert course.thumbnail_id == old_thumbnail.pk
    new_thumbnail = Photo.objects.get(s3_key="platform/curated-photos/new-cover.jpg")
    assert course.thumbnail_id != new_thumbnail.pk


def test_execute_set_logo_materializes_photo_flips_look_edited_and_busts_cache(client, coach):
    from django.core.cache import cache

    from apps.core.models import CuratedLogo
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    row = CuratedLogo.objects.create(
        title="Lotus mark",
        tags="yoga, calm",
        image_key="platform/curated-logos/lotus.png",
    )
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action("shared_test", {"kind": "set_logo", "curated_logo_id": row.pk})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "set_logo"}
    photo = Photo.objects.get(s3_key="platform/curated-logos/lotus.png")
    cfg = TenantConfig.objects.first()
    assert cfg.logo_id == photo.pk
    assert cfg.logo_url == ""
    assert cfg.setup_progress.get("look_edited") is True
    assert cache.get("tenant:shared_test:config") is None


def test_execute_set_logo_gone_catalog_row_returns_400(client, coach):
    token = copilot_tokens.stash_action("shared_test", {"kind": "set_logo", "curated_logo_id": 999999})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "no longer available" in resp.json()["detail"]


def test_execute_set_logo_with_attached_photo_uses_tenant_photo(client, coach):
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    photo = Photo.objects.create(s3_key="uploads/my-mark.png", title="My mark")
    token = copilot_tokens.stash_action("shared_test", {"kind": "set_logo", "tenant_photo_id": str(photo.pk)})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "set_logo"}
    cfg = TenantConfig.objects.first()
    assert cfg.logo_id == photo.pk
    assert cfg.logo_url == ""
    assert cfg.setup_progress.get("look_edited") is True


def test_execute_set_logo_with_unknown_attached_photo_returns_400(client, coach):
    from apps.tenant_config.models import TenantConfig

    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "set_logo", "tenant_photo_id": "00000000-0000-0000-0000-000000000000"},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "not in your library" in resp.json()["detail"]


def test_execute_set_logo_with_prior_logo_records_audit_and_undo_restores_it(client, coach):
    """Regression for Finding 6: cfg.logo_id is a Photo UUID pk — same
    silent audit-loss hazard as set_course_cover above, for restore_logo."""
    from apps.core.curated_logos.materialize import materialize_curated_logo
    from apps.core.models import CuratedLogo
    from apps.media.models import Photo
    from apps.tenant_config.models import CopilotAudit, TenantConfig

    old_row = CuratedLogo.objects.create(
        title="Old mark", tags="yoga", image_key="platform/curated-logos/prior-mark.png"
    )
    old_logo = materialize_curated_logo(old_row)
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.logo = old_logo
    cfg.logo_url = "https://old.example.com/logo.png"
    cfg.save(update_fields=["logo", "logo_url"])

    new_row = CuratedLogo.objects.create(
        title="Lotus mark", tags="yoga, calm", image_key="platform/curated-logos/new-mark.png"
    )
    token = copilot_tokens.stash_action("shared_test", {"kind": "set_logo", "curated_logo_id": new_row.pk})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    audit_id = resp.json()["audit_id"]
    assert audit_id is not None  # the audit row must exist at all

    row = CopilotAudit.objects.get(pk=audit_id)
    assert row.inverse["kind"] == "restore_logo"
    assert row.inverse["logo_id"] == str(old_logo.pk)
    assert isinstance(row.inverse["logo_id"], str)
    assert row.inverse["logo_url"] == "https://old.example.com/logo.png"

    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit_id}, format="json")
    assert undo.status_code == 200, undo.content
    cfg.refresh_from_db()
    assert cfg.logo_id == old_logo.pk
    assert cfg.logo_url == "https://old.example.com/logo.png"
    new_logo = Photo.objects.get(s3_key="platform/curated-logos/new-mark.png")
    assert cfg.logo_id != new_logo.pk


def test_execute_records_audit_row(client, coach):
    from apps.tenant_config.models import CopilotAudit, TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
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


def test_execute_pages_action_records_pages_inverse(client, coach):
    from apps.tenant_config.models import CopilotAudit, TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    before = cfg.pages
    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "toggle_block", "page": "home", "block_id": "blk_hero", "enabled": False}
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    row = CopilotAudit.objects.latest("created_at")
    assert row.inverse["kind"] == "restore_pages"
    assert row.inverse["pages"] == before


def test_execute_theme_action_records_old_theme(client, coach):
    from apps.tenant_config.models import CopilotAudit, TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.theme = "ocean"
    cfg.save(update_fields=["theme"])
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "ember"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    row = CopilotAudit.objects.latest("created_at")
    assert row.inverse == {"kind": "edit_theme", "theme": "ocean"}


def test_create_course_has_empty_inverse(client, coach):
    from apps.tenant_config.models import CopilotAudit

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_course", "params": {"title": "Yoga 101", "price": "0.00", "pricing_type": "free"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    row = CopilotAudit.objects.latest("created_at")
    assert row.inverse == {}


def test_execute_response_carries_audit_id(client, coach):
    from apps.tenant_config.models import CopilotAudit

    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_course", "params": {"title": "Yoga 101", "price": "0.00", "pricing_type": "free"}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "audit_id" in body
    row = CopilotAudit.objects.latest("created_at")
    assert body["audit_id"] == row.id


def test_audit_write_failure_never_fails_the_execute(client, coach, monkeypatch):
    from unittest import mock

    from apps.core.copilot import views as copilot_views
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
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


# --- undo -------------------------------------------------------------


def _toggle_token(enabled):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": not enabled, "heading": "Hi"}]}}
    cfg.save(update_fields=["pages"])
    return copilot_tokens.stash_action(
        "shared_test", {"kind": "toggle_block", "page": "home", "block_id": "blk_hero", "enabled": enabled}
    )


def _theme_token(theme):
    from apps.tenant_config.models import TenantConfig

    # Order-independence under xdist: edit_theme's execute 400s without a
    # TenantConfig row, and no fixture guarantees one exists.
    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    return copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": theme})


def _execute_token(client, token):
    return client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")


def _current_pages():
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    return cfg.pages


def _latest_audit():
    from apps.tenant_config.models import CopilotAudit

    return CopilotAudit.objects.latest("created_at")


def test_undo_restores_pages_snapshot(client, coach):
    token = _toggle_token(enabled=False)
    before = _current_pages()
    res = _execute_token(client, token)
    assert res.status_code == 200, res.content
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.json()["audit_id"]}, format="json")
    assert undo.status_code == 200, undo.content
    assert undo.json() == {"undone": "toggle_block"}
    assert _current_pages() == before
    assert _latest_audit().undone_at is not None


def test_undo_rejects_non_latest(client, coach):
    first = _execute_token(client, _toggle_token(enabled=False))
    _execute_token(client, _theme_token("ember"))
    res = client.post("/api/v1/admin/copilot/undo/", {"audit_id": first.json()["audit_id"]}, format="json")
    assert res.status_code == 400


def test_undo_twice_rejected(client, coach):
    res = _execute_token(client, _theme_token("ember"))
    client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.json()["audit_id"]}, format="json")
    again = client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.json()["audit_id"]}, format="json")
    assert again.status_code == 400


def test_undo_unknown_id_returns_404(client, coach):
    res = client.post("/api/v1/admin/copilot/undo/", {"audit_id": 999999}, format="json")
    assert res.status_code == 404


def test_undo_not_undoable_kind_returns_400(client, coach):
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "create_course", "params": {"title": "Yoga 101", "price": "0.00", "pricing_type": "free"}},
    )
    res = _execute_token(client, token)
    assert res.status_code == 200, res.content
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.json()["audit_id"]}, format="json")
    assert undo.status_code == 400


def test_undo_busts_cache(client, coach):
    from django.core.cache import cache

    res = _execute_token(client, _theme_token("ember"))
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": res.json()["audit_id"]}, format="json")
    assert undo.status_code == 200, undo.content
    assert cache.get("tenant:shared_test:config") is None


def test_undo_non_integer_audit_id_returns_404(client, coach):
    res = client.post("/api/v1/admin/copilot/undo/", {"audit_id": "abc"}, format="json")
    assert res.status_code == 404
    assert res.json() == {"detail": "not_found"}


def test_undo_restore_logo_gone_photo_returns_400_and_stays_undone(client, coach):
    from apps.core.curated_logos.materialize import materialize_curated_logo
    from apps.core.models import CuratedLogo
    from apps.tenant_config.models import CopilotAudit

    # Inverse payloads persist through a JSONField, so a Photo FK id round-
    # trips as a string (as it would from a real execute→undo cycle) — build
    # the audit row directly rather than through /execute/, which sidesteps
    # an unrelated pre-existing bug (raw UUID objects aren't JSON-
    # serializable) in how `_execute` currently constructs restore_logo's
    # inverse; that bug is out of scope here. This isolates exactly what's
    # under test: `_apply_inverse` must existence-check before assigning a
    # non-null logo_id.
    row = CuratedLogo.objects.create(
        title="Lotus mark", tags="yoga, calm", image_key="platform/curated-logos/lotus-undo.png"
    )
    photo = materialize_curated_logo(row)
    audit = CopilotAudit.objects.create(
        kind="set_logo",
        summary="Set a new logo",
        payload={"kind": "set_logo", "curated_logo_id": row.pk},
        result={"kind": "set_logo"},
        inverse={"kind": "restore_logo", "logo_id": str(photo.pk), "logo_url": ""},
    )
    photo.delete()
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit.pk}, format="json")
    assert undo.status_code == 400
    assert "no longer exists" in undo.json()["detail"]
    audit.refresh_from_db()
    assert audit.undone_at is None


def test_undo_restore_course_cover_gone_photo_returns_400_and_stays_undone(client, coach):
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.core.models import CuratedPhoto
    from apps.courses.models import Course
    from apps.tenant_config.models import CopilotAudit

    # Same rationale as the restore_logo test above: build the audit row
    # directly (with the Photo id stored as str, as it would round-trip
    # through the JSONField on a real execute) to isolate `_apply_inverse`'s
    # existence check from the unrelated pre-existing raw-UUID JSON
    # serialization bug in `_execute`'s inverse construction.
    row = CuratedPhoto.objects.create(
        title="Golden-hour mat flow", tags="yoga, flow", kind="hero", image_key="platform/curated-photos/mat-undo.jpg"
    )
    photo = materialize_curated_photo(row)
    course = Course.objects.create(title="Yoga Basics", instructor=coach, thumbnail=photo)
    audit = CopilotAudit.objects.create(
        kind="set_course_cover",
        summary="Set the cover photo for 'Yoga Basics'",
        payload={"kind": "set_course_cover", "course_id": course.pk, "curated_photo_id": row.pk},
        result={"kind": "set_course_cover", "id": course.pk, "title": "Yoga Basics", "url": "/admin/courses/x"},
        inverse={"kind": "restore_course_cover", "course_id": course.pk, "thumbnail_id": str(photo.pk)},
    )
    photo.delete()
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit.pk}, format="json")
    assert undo.status_code == 400
    assert "no longer exists" in undo.json()["detail"]
    audit.refresh_from_db()
    assert audit.undone_at is None


# ── chats: server-side threads for the drawer ────────────────────────────────


def test_chats_create_list_get_roundtrip(client):
    created = client.post(
        "/api/v1/admin/copilot/chats/",
        {"entries": [{"role": "coach", "text": "make my hero warmer"}, {"role": "assistant", "text": "Done"}]},
        format="json",
    )
    assert created.status_code == 201
    chat_id = created.json()["id"]
    # Title derives from the first coach line when none was given.
    assert created.json()["title"] == "make my hero warmer"

    listed = client.get("/api/v1/admin/copilot/chats/")
    assert listed.status_code == 200
    assert [c["id"] for c in listed.json()["chats"]] == [chat_id]

    detail = client.get(f"/api/v1/admin/copilot/chats/{chat_id}/")
    assert detail.status_code == 200
    assert detail.json()["entries"][0] == {"role": "coach", "text": "make my hero warmer"}


def test_chats_patch_entries_caps_and_sanitizes(client):
    created = client.post("/api/v1/admin/copilot/chats/", {}, format="json")
    chat_id = created.json()["id"]
    junk_entries = [{"role": "coach", "text": f"m{i}"} for i in range(40)] + [
        {"role": "hacker", "text": "drop"},
        "not-a-dict",
        {"role": "assistant", "text": 12},
    ]
    patched = client.patch(f"/api/v1/admin/copilot/chats/{chat_id}/", {"entries": junk_entries}, format="json")
    assert patched.status_code == 200
    entries = patched.json()["entries"]
    assert len(entries) == 30  # trailing-window cap
    assert all(e["role"] in ("coach", "assistant") for e in entries)
    # 41 valid entries survive the shape filter (the int text coerces to
    # "12"); the trailing-30 window therefore starts at m11 — and the
    # empty-title chat derives its title from that first coach line.
    assert patched.json()["title"] == "m11"


def test_chats_entries_keep_attached_photos(client):
    """The attached-photo note must survive the round trip — follow-up turns
    ("use it as the logo") rebuild the transcript from persisted entries."""
    created = client.post(
        "/api/v1/admin/copilot/chats/",
        {
            "entries": [
                {
                    "role": "coach",
                    "text": "here is my photo",
                    "attached": [
                        {
                            "id": "abc-123",
                            "title": "My mark",
                            "desc": "a ballet dancer",
                            "signed_url": "https://s3.example/thumb.png?sig=x",
                        },
                        {"id": 42, "title": None},  # missing/odd fields are coerced
                        {"no_id": True},  # dropped: no id
                    ],
                },
                {"role": "assistant", "text": "Where should it go?", "attached": "junk"},
            ]
        },
        format="json",
    )
    assert created.status_code == 201
    entries = created.json()["entries"]
    assert entries[0]["attached"] == [
        {
            "id": "abc-123",
            "title": "My mark",
            "desc": "a ballet dancer",
            "signed_url": "https://s3.example/thumb.png?sig=x",
        },
        {"id": "42", "title": ""},
    ]
    assert "attached" not in entries[1]


def test_chats_delete_and_missing_404(client):
    created = client.post("/api/v1/admin/copilot/chats/", {}, format="json")
    chat_id = created.json()["id"]
    assert client.delete(f"/api/v1/admin/copilot/chats/{chat_id}/").status_code == 204
    assert client.get(f"/api/v1/admin/copilot/chats/{chat_id}/").status_code == 404


def test_chats_create_prunes_beyond_cap(client):
    from apps.core.copilot.views import MAX_CHATS
    from apps.tenant_config.models import CopilotChat

    for i in range(MAX_CHATS + 2):
        client.post("/api/v1/admin/copilot/chats/", {"title": f"chat {i}"}, format="json")
    assert CopilotChat.objects.count() == MAX_CHATS


# ── attached photos: converse context + placement via tenant photo ───────────


def test_converse_passes_verified_attachments_to_run_turn(client):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="uploads/p.png", title="My studio", alt_text="sunlit yoga studio")
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.engine.run_turn", return_value=({"kind": "answer", "text": "ok"}, Decimal("0"))
        ) as run,
        mock.patch("apps.core.copilot.views.ai_compose.record_spend"),
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {
                "message": "use this",
                "transcript": [],
                "selections": [],
                "attached_photos": [str(photo.pk), "00000000-0000-0000-0000-000000000000"],
            },
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        _frames(resp)  # the stream is lazy — consume it so run_turn executes
    attachments = run.call_args.args[4]
    assert attachments == [{"id": str(photo.pk), "title": "My studio", "desc": "sunlit yoga studio"}]


def test_execute_note_photo_saves_alt_text_and_undo_restores(client, coach):
    from apps.media.models import Photo
    from apps.tenant_config.models import CopilotAudit

    photo = Photo.objects.create(s3_key="uploads/ballet.png", title="IMG_1234", alt_text="old note")
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "note_photo", "tenant_photo_id": str(photo.pk), "description": "silhouette of a ballet dancer"},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    photo.refresh_from_db()
    assert photo.alt_text == "silhouette of a ballet dancer"

    audit_id = resp.json()["audit_id"]
    row = CopilotAudit.objects.get(pk=audit_id)
    assert row.inverse == {
        "kind": "restore_photo_note",
        "tenant_photo_id": str(photo.pk),
        "alt_text": "old note",
    }
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit_id}, format="json")
    assert undo.status_code == 200, undo.content
    photo.refresh_from_db()
    assert photo.alt_text == "old note"


def test_execute_note_photo_unknown_photo_returns_400(client, coach):
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "note_photo",
            "tenant_photo_id": "00000000-0000-0000-0000-000000000000",
            "description": "a dancer",
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "not in your library" in resp.json()["detail"]


def test_photo_describe_returns_description_and_records_spend(client):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="uploads/b.png", title="B")
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.photos.describe_tenant_photo",
            return_value=("a ballet dancer silhouette", Decimal("0.001")),
        ),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend") as spend,
    ):
        resp = client.post(
            "/api/v1/admin/copilot/photos/describe/", {"photo_id": str(photo.pk)}, format="json"
        )
    assert resp.status_code == 200
    assert resp.json() == {"description": "a ballet dancer silhouette"}
    spend.assert_called_once_with("shared_test", Decimal("0.001"))


def test_photo_describe_unavailable_or_unknown_photo_is_empty(client):
    with mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=False):
        resp = client.post("/api/v1/admin/copilot/photos/describe/", {"photo_id": "x"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"description": ""}
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend"),
    ):
        resp = client.post(
            "/api/v1/admin/copilot/photos/describe/",
            {"photo_id": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.json() == {"description": ""}


def test_execute_set_course_cover_with_tenant_photo(client):
    from apps.courses.models import Course
    from apps.media.models import Photo

    coach_user = User.objects.get(email="copilot-coach@x.com")
    course = Course.objects.create(title="C", instructor=coach_user, price=0, pricing_type="free")
    photo = Photo.objects.create(s3_key="uploads/mine.jpg", title="Mine")
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "set_course_cover", "course_id": course.pk, "tenant_photo_id": str(photo.pk)},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200
    course.refresh_from_db()
    assert course.thumbnail_id == photo.pk


def test_execute_set_course_cover_with_missing_tenant_photo_400(client):
    from apps.courses.models import Course

    coach_user = User.objects.get(email="copilot-coach@x.com")
    course = Course.objects.create(title="C2", instructor=coach_user, price=0, pricing_type="free")
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "set_course_cover", "course_id": course.pk, "tenant_photo_id": "00000000-0000-0000-0000-000000000000"},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "not in your library" in resp.json()["detail"]
