"""Coach admin API: gating reasons, generation flow (AI mocked), publish
transitions, autopilot next_run computation. Auth as a coach/owner user —
mirrors the fixture pattern in apps/tenant_config/tests/test_logo_ai_views.py."""

import contextlib
import json
from decimal import Decimal
from unittest import mock

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog import ai
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea
from apps.core.models import PlatformPlan, PlatformSubscription

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@blogadmintest.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def coach_client(coach):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def free_tenant(tenant_ctx):
    return tenant_ctx


@pytest.fixture()
def paid_tenant(tenant_ctx):
    # PlatformPlan/Subscription/User are public-schema; create them under the
    # public schema explicitly so the subscription's user FK resolves (this
    # fixture runs inside tenant_ctx, which would otherwise write the user to
    # the tenant schema and break the cross-schema FK).
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Blog Admin Test Paid", price_monthly=19, transaction_fee_pct=5, max_ai_blog_posts=5
        )
        owner = User.objects.create_user(
            email="blogadmin-owner@x.com",
            name="Owner",
            password="x",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Blog Admin Test Paid").delete()
            User.objects.filter(email="blogadmin-owner@x.com").delete()

    _scrub()
    yield
    _scrub()


def _draft_result(cover_photo_id="", image_placements=None):
    return ai.DraftResult(
        {
            "title": "T",
            "body_html": "<p>b</p>",
            "excerpt": "e",
            "meta_description": "m",
            "tags": ["t"],
            "ai_model": "x",
            "cover_photo_id": cover_photo_id,
            "image_placements": image_placements or [],
        },
        Decimal("0.03"),
    )


def _spend_free_grant(tenant):
    """Put a free tenant past its one-off lifetime AI generation, which is the
    only state in which the free plan is actually gated."""
    tenant.free_blog_grant_used = True
    tenant.save(update_fields=["free_blog_grant_used"])
    return tenant


def test_generate_upgrade_required_once_free_grant_is_spent(coach_client, free_tenant):
    _spend_free_grant(free_tenant)
    res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200
    assert res.data["post"] is None and res.data["source"] == "upgrade_required"


def test_generate_spends_the_free_grant_on_a_free_tenant(coach_client, free_tenant, settings):
    """The free plan gets exactly one generation, ever: the first call succeeds
    and burns the grant, the second is gated."""
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        first = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert first.data["source"] == "ai"
    free_tenant.refresh_from_db()
    assert free_tenant.free_blog_grant_used is True

    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        second = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "sleep"}, format="json")
    assert second.data["post"] is None and second.data["source"] == "upgrade_required"


def test_generate_creates_draft_and_consumes_credit(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.status == "draft" and post.source == "ai" and post.slug
    assert ai.tenant_usage(paid_tenant.schema_name).generations_used == 1


def test_generate_failure_records_cost_not_credit(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post", side_effect=ai.BlogAiError("bad", cost_usd=Decimal("0.02"))):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "x"}, format="json")
    assert res.data["source"] == "error"
    usage = ai.tenant_usage(paid_tenant.schema_name)
    assert usage.usd_spent == Decimal("0.02") and usage.generations_used == 0


def test_generate_marks_topic_used(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    topic = BlogTopicIdea.objects.create(title="Sleep myths", angle="")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        coach_client.post("/api/v1/admin/blog/generate/", {"topic_id": topic.id}, format="json")
    topic.refresh_from_db()
    assert topic.status == "used"


def test_manual_create_without_slug_derives_one(coach_client, free_tenant):
    """Regression: the client never sends a slug (it's server-derived via
    unique_slug in perform_create) — the serializer must not require it."""
    res = coach_client.post("/api/v1/admin/blog/posts/", {"title": "My First Post"}, format="json")
    assert res.status_code == 201
    assert res.data["slug"] == "my-first-post"


def test_create_published_directly_stamps_published_at(coach_client, free_tenant):
    """Regression: a create call with status=published (bypassing the usual
    draft-then-publish flow) must still stamp published_at."""
    res = coach_client.post(
        "/api/v1/admin/blog/posts/", {"title": "Live from day one", "status": "published"}, format="json"
    )
    assert res.status_code == 201
    assert res.data["published_at"] is not None


def test_publish_transition_sets_published_at(coach_client, paid_tenant):
    post = BlogPost.objects.create(title="x", slug="x")
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post.id}/", {"status": "published"}, format="json")
    assert res.status_code == 200
    post.refresh_from_db()
    assert post.published_at is not None
    coach_client.patch(f"/api/v1/admin/blog/posts/{post.id}/", {"status": "draft"}, format="json")
    post.refresh_from_db()
    assert post.published_at is None


def test_autopilot_patch_computes_next_run(coach_client, paid_tenant):
    res = coach_client.patch(
        "/api/v1/admin/blog/autopilot/",
        {"is_enabled": True, "frequency": "weekly", "weekday": 0, "generate_time": "09:00"},
        format="json",
    )
    assert res.status_code == 200
    assert BlogAutopilot.load().next_run_at is not None


def test_topics_refill_uses_topic_batch(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(
        ai, "generate_topics", return_value=([{"title": f"t{i}", "angle": ""} for i in range(12)], Decimal("0.004"))
    ):
        res = coach_client.post("/api/v1/admin/blog/topics/", format="json")
    assert res.status_code == 200
    assert BlogTopicIdea.objects.filter(status="available").count() == 12


def test_generate_passes_tenant_photos_to_ai(coach_client, paid_tenant, settings):
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    Photo.objects.create(s3_key="k", title="Sunrise stretch")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()) as gen:
        coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    passed_photos = list(gen.call_args.kwargs["photos"])
    assert len(passed_photos) == 1 and passed_photos[0].title == "Sunrise stretch"


def test_generate_resolves_cover_photo_fk(coach_client, paid_tenant, settings):
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    photo = Photo.objects.create(s3_key="k", title="Sunrise stretch")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result(cover_photo_id=str(photo.id))):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id == photo.id


def test_generate_with_no_cover_photo_id_leaves_field_null(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id is None


def test_generate_materializes_curated_cover(coach_client, paid_tenant, settings):
    from django_tenants.utils import schema_context as _sc

    from apps.core.models import CuratedPhoto
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    with _sc("public"):
        row = CuratedPhoto.objects.create(
            title="Sunrise run",
            tags="habits",
            kind="hero",
            alt_text="runner",
            image_key="platform/curated-photos/run.png",
        )
    with mock.patch.object(ai, "generate_post", return_value=_draft_result(cover_photo_id=f"curated:{row.pk}")) as gen:
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200 and res.data["source"] == "ai"
    photo = Photo.objects.get(s3_key="platform/curated-photos/run.png")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id == photo.id
    # curated candidates were offered alongside tenant photos
    offered_ids = [str(p.id) for p in gen.call_args.kwargs["photos"]]
    assert f"curated:{row.pk}" in offered_ids
    with _sc("public"):
        CuratedPhoto.objects.all().delete()


def test_admin_can_set_and_clear_cover(coach_client, paid_tenant):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/c.png", title="Cover")
    created = coach_client.post("/api/v1/admin/blog/posts/", {"title": "P", "body_html": ""}, format="json")
    post_id = created.data["id"]
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post_id}/", {"cover_photo": str(photo.id)}, format="json")
    assert res.status_code == 200
    assert res.data["cover_photo"] == photo.id
    assert res.data["cover_photo_url"]
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post_id}/", {"cover_photo": None}, format="json")
    assert res.data["cover_photo"] is None and res.data["cover_photo_url"] is None


def test_admin_placements_validated(coach_client, paid_tenant):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="platform/curated-photos/i.png", title="I")
    created = coach_client.post(
        "/api/v1/admin/blog/posts/", {"title": "P2", "body_html": "<h2>Sec</h2>"}, format="json"
    )
    post_id = created.data["id"]
    good = coach_client.patch(
        f"/api/v1/admin/blog/posts/{post_id}/",
        {"image_placements": [{"heading": "Sec", "photo_id": str(photo.id)}]},
        format="json",
    )
    assert good.status_code == 200
    assert good.data["image_placements_resolved"][0]["url"]
    bad = coach_client.patch(
        f"/api/v1/admin/blog/posts/{post_id}/",
        {"image_placements": [{"heading": "Sec", "photo_id": "not-a-photo"}]},
        format="json",
    )
    assert bad.status_code == 400


# ── Streamed generation (Accept: text/event-stream) ─────────────────────────
# The blocking path above stays the contract for the autopilot task; these
# cover the progress stream and, critically, WHEN the quota meter commits.


def _sse_frames(response):
    """Drain a StreamingHttpResponse into parsed event dicts."""
    body = b"".join(response.streaming_content).decode()
    return [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def _stream_post(coach_client, body):
    return coach_client.post("/api/v1/admin/blog/generate/", body, format="json", HTTP_ACCEPT="text/event-stream")


def _fake_stream(*, previews=(), result=None, error=None):
    def _gen(*args, **kwargs):
        yield ("phase", "drafting")
        for p in previews:
            yield ("preview", p)
        if error is not None:
            raise error
        yield ("phase", "rendering")
        yield ("result", result)

    return _gen


def test_stream_emits_phases_previews_then_done(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    previews = [{"title": "Morning Habits", "excerpt": "", "headings": ["Intro"]}]
    with mock.patch.object(ai, "generate_post_stream", _fake_stream(previews=previews, result=_draft_result())):
        frames = _sse_frames(_stream_post(coach_client, {"custom_topic": "habits"}))

    assert [f["type"] for f in frames] == ["phase", "phase", "preview", "phase", "done"]
    assert frames[2]["title"] == "Morning Habits" and frames[2]["headings"] == ["Intro"]
    done = frames[-1]
    assert done["source"] == "ai" and done["post"]["id"]
    assert BlogPost.objects.get(pk=done["post"]["id"]).source == "ai"
    assert ai.tenant_usage(paid_tenant.schema_name).generations_used == 1


def test_stream_charges_quota_on_first_preview_not_completion(coach_client, paid_tenant, settings):
    """The abuse guard: a coach who watches the title land and then bails has
    still spent a slot, so 'reroll until the title looks good' is not free."""
    settings.ANTHROPIC_API_KEY = "test-key"
    previews = [{"title": "Peek", "excerpt": "", "headings": []}]

    def _abandon_after_preview(*args, **kwargs):
        yield ("phase", "drafting")
        yield ("preview", previews[0])
        raise GeneratorExit  # the client hung up mid-stream

    with mock.patch.object(ai, "generate_post_stream", _abandon_after_preview), contextlib.suppress(GeneratorExit):
        _sse_frames(_stream_post(coach_client, {"custom_topic": "habits"}))

    assert ai.tenant_usage(paid_tenant.schema_name).generations_used == 1
    assert BlogPost.objects.count() == 0


def test_stream_failure_before_any_output_charges_cost_not_quota(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    err = ai.BlogAiError("provider down", cost_usd=Decimal("0.02"))
    with mock.patch.object(ai, "generate_post_stream", _fake_stream(error=err)):
        frames = _sse_frames(_stream_post(coach_client, {"custom_topic": "habits"}))

    assert frames[-1] == {"type": "error", "source": "error"}
    usage = ai.tenant_usage(paid_tenant.schema_name)
    assert usage.usd_spent == Decimal("0.02") and usage.generations_used == 0


def test_stream_gating_stays_plain_json(coach_client, free_tenant):
    """Guards run before the stream opens, so a blocked coach gets the same
    JSON body as the non-streaming path — no SSE, nothing to parse."""
    _spend_free_grant(free_tenant)
    res = _stream_post(coach_client, {"custom_topic": "habits"})
    assert res.status_code == 200
    assert res["Content-Type"] == "application/json"
    assert json.loads(res.content)["source"] == "upgrade_required"


def test_stream_sets_no_buffering_headers(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post_stream", _fake_stream(result=_draft_result())):
        res = _stream_post(coach_client, {"custom_topic": "habits"})
        assert res["Content-Type"] == "text/event-stream"
        assert res["X-Accel-Buffering"] == "no" and res["Cache-Control"] == "no-cache"
        b"".join(res.streaming_content)


def test_stream_marks_topic_used(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    topic = BlogTopicIdea.objects.create(title="Sleep myths", angle="")
    with mock.patch.object(ai, "generate_post_stream", _fake_stream(result=_draft_result())):
        _sse_frames(_stream_post(coach_client, {"topic_id": topic.id}))
    topic.refresh_from_db()
    assert topic.status == "used"


def test_stream_done_frame_serializes_uuid_fields(coach_client, paid_tenant, settings):
    """Regression: the done frame ships serializer output, which carries the
    cover photo's UUID. Plain json.dumps refuses UUIDs, so a post WITH a cover
    used to fail mid-stream after a successful 45s generation (caught against
    the live dev stack, not by the earlier tests — their fixture had no
    cover)."""
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    photo = Photo.objects.create(s3_key="k.png", title="Cover")
    result = _draft_result(cover_photo_id=str(photo.id))
    with mock.patch.object(ai, "generate_post_stream", _fake_stream(result=result)):
        frames = _sse_frames(_stream_post(coach_client, {"custom_topic": "habits"}))

    done = frames[-1]
    assert done["type"] == "done"
    assert done["post"]["cover_photo"] is not None
