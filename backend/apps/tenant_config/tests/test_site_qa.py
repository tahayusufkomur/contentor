"""The finished site's last visual check: when it starts, what it fixes
(through the copilot's doors) and what it leaves for a person."""

import io
from decimal import Decimal
from unittest import mock

import pytest
from PIL import Image

from apps.core import ai as core_ai
from apps.core.models import Tenant
from apps.tenant_config import site_qa
from apps.tenant_config.models import CopilotAudit, TenantConfig
from apps.tenant_config.site_qa import Finding, PageReview

pytestmark = pytest.mark.django_db

PAGES = {
    "home": {
        "blocks": [
            {"id": "blk_hero", "type": "hero", "heading": "Welcome to a very long heading that runs off the phone"},
            {"id": "blk_text", "type": "richText", "heading": "Lorem ipsum", "body": "<p>Hi</p>"},
        ]
    }
}


@pytest.fixture()
def config(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {"niche": "yoga"}})
    tenant_ctx.refresh_from_db()
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.pages = PAGES
    cfg.setup_flow = {"status": "active", "page_builds": {"home": {"status": "ready"}}}
    cfg.save()
    return cfg


@pytest.fixture()
def on():
    """The check switched on, with its task captured instead of queued."""
    with (
        mock.patch.object(site_qa, "available", return_value=True),
        mock.patch("apps.core.tasks.site_qa_task.delay") as delay,
    ):
        yield delay


def _state():
    return (TenantConfig.objects.first().setup_flow or {}).get("qa") or {}


def _finish(status="done", **extra):
    cfg = TenantConfig.objects.first()
    cfg.setup_flow = {**cfg.setup_flow, "qa": {**_state(), "status": status, "sig": site_qa._signature(cfg), **extra}}
    cfg.save()
    return cfg


# ── when it runs ─────────────────────────────────────────────────────────────


def test_off_says_nothing_and_queues_nothing(tenant_ctx, config):
    with mock.patch("apps.core.tasks.site_qa_task.delay") as delay:
        assert site_qa.ensure(tenant_ctx, config) is None
    delay.assert_not_called()


def test_a_finished_site_is_checked_once(tenant_ctx, config, on):
    assert site_qa.ensure(tenant_ctx, config)["status"] == "checking"
    on.assert_called_once_with(tenant_ctx.id)
    # The card polls while it runs: no second task.
    assert site_qa.ensure(tenant_ctx, TenantConfig.objects.first())["status"] == "checking"
    assert on.call_count == 1
    # Checked as it is now: not again.
    cfg = _finish(pages=1, fixed=["Tidied the wording on your home page"])
    assert site_qa.ensure(tenant_ctx, cfg) == {
        "status": "done",
        "pages": 1,
        "fixed": ["Tidied the wording on your home page"],
    }
    assert on.call_count == 1


def test_a_changed_site_is_checked_once_more_and_no_further(tenant_ctx, config, on):
    site_qa.ensure(tenant_ctx, config)
    for heading in ("Second", "Third"):
        cfg = _finish()
        cfg.pages = {"home": {"blocks": [{"id": "blk_hero", "type": "hero", "heading": heading}]}}
        cfg.save()
        site_qa.ensure(tenant_ctx, cfg)
    assert on.call_count == site_qa.MAX_RUNS == 2


def test_no_new_check_once_setup_is_over(tenant_ctx, config, on):
    config.setup_flow = {**config.setup_flow, "status": "done"}
    config.save()
    site_qa.ensure(tenant_ctx, config)
    on.assert_not_called()


def test_a_check_that_died_reads_failed(tenant_ctx, config, on):
    config.setup_flow = {
        **config.setup_flow,
        "qa": {"status": "checking", "started": "2026-01-01T00:00:00+00:00", "runs": site_qa.MAX_RUNS},
    }
    config.save()
    assert site_qa.ensure(tenant_ctx, config)["status"] == "failed"


def test_held_pricing_page_is_skipped():
    flow = {
        "page_builds": {
            "home": {"status": "ready"},
            "pricing": {"status": "ready"},
        },
        "held": {"plans": True},
    }
    assert site_qa._built_pages(flow) == ["home"]


# ── what it does ─────────────────────────────────────────────────────────────


def _run(tenant, findings, cost="0.25"):
    capture = {"theme": "light", "tiles": ["QUJD"], "issues": []}
    with (
        mock.patch.object(site_qa, "_views", return_value=[("Desktop", capture)]),
        mock.patch.object(
            core_ai, "structured_messages", return_value=(PageReview(findings=findings), Decimal(cost), "m")
        ) as review,
        mock.patch("apps.core.onboarding.ai_compose.record_spend") as spend,
    ):
        site_qa.run(tenant)
    return review, spend


def test_fixes_go_through_the_copilot_and_the_rest_is_left_open(tenant_ctx, config):
    review, spend = _run(
        tenant_ctx,
        [
            Finding(
                where="Phone, hero",
                issue="The heading runs off the screen.",
                severity="noticeable",
                fix="rewrite_text",
                block_id="blk_hero",
                field="heading",
                value="Welcome",
            ),
            # The first section never goes, an id the model made up fixes nothing,
            # a minor finding is not worth a change, and layout needs a person.
            Finding(where="Hero", issue="Looks empty.", severity="blocker", fix="hide_block", block_id="blk_hero"),
            Finding(where="?", issue="Broken.", severity="blocker", fix="hide_block", block_id="blk_nope"),
            Finding(where="Text", issue="Placeholder.", severity="minor", fix="hide_block", block_id="blk_text"),
            Finding(where="Footer", issue="Columns overlap.", severity="noticeable"),
        ],
    )
    cfg = TenantConfig.objects.first()
    blocks = cfg.pages["home"]["blocks"]
    assert blocks[0]["heading"] == "Welcome" and all(b.get("enabled", True) for b in blocks)
    qa = cfg.setup_flow["qa"]
    assert qa["status"] == "done" and qa["pages"] == 1
    assert qa["fixed"] == ["Tidied the wording on your home page"]
    assert [o["issue"] for o in qa["open"]] == ["Looks empty.", "Broken.", "Placeholder.", "Columns overlap."]
    assert qa["sig"] == site_qa._signature(cfg)  # its own fix does not start another check
    # In the coach's "what changed" trail, with its undo.
    audit = CopilotAudit.objects.get()
    assert audit.kind == "edit_block_fields" and audit.inverse["kind"] == "restore_pages"
    spend.assert_called_once_with(tenant_ctx.schema_name, 0.25)
    # The reviewer saw the page's blocks and its screenshots.
    content = review.call_args.kwargs["messages"][0]["content"]
    assert "blk_hero hero" in content[0]["text"] and "Teaches: yoga" in content[0]["text"]
    assert any(part["type"] == "image" for part in content)


def test_a_broken_section_past_the_first_is_hidden(tenant_ctx, config):
    _run(
        tenant_ctx,
        [Finding(where="Text", issue="Placeholder copy.", severity="blocker", fix="hide_block", block_id="blk_text")],
    )
    cfg = TenantConfig.objects.first()
    assert cfg.pages["home"]["blocks"][1]["enabled"] is False
    assert cfg.setup_flow["qa"]["fixed"] == ["Hid an unfinished section on your home page"]


def test_a_check_that_cannot_look_fails_without_touching_the_site(tenant_ctx, config):
    with mock.patch.object(site_qa, "_views", side_effect=OSError("browser is down")):
        site_qa.run(tenant_ctx)
    cfg = TenantConfig.objects.first()
    assert cfg.setup_flow["qa"]["status"] == "failed" and cfg.pages == PAGES


def _logo(config, image):
    from apps.media.models import Photo

    buf = io.BytesIO()
    image.save(buf, "PNG")
    config.logo = Photo.objects.create(s3_key="tenants/t/photo/logo.png", title="Logo", content_type="image/png")
    s3 = mock.Mock()
    s3.get_object.return_value = {"Body": io.BytesIO(buf.getvalue())}
    return s3


def test_a_logo_in_a_paper_box_is_swapped_for_its_cutout(tenant_ctx, config):
    boxed = Image.new("RGB", (300, 200), (255, 255, 255))
    for x in range(100, 200):
        for y in range(60, 140):
            boxed.putpixel((x, y), (20, 60, 160))
    s3 = _logo(config, boxed)
    with (
        mock.patch("apps.core.storage.get_s3_client", return_value=s3),
        mock.patch("apps.core.platform.uploads._store_object") as store,
    ):
        action = site_qa._clean_logo(config)
    assert action["kind"] == "set_logo" and action["tenant_photo_id"] != str(config.logo.pk)
    cutout = Image.open(io.BytesIO(store.call_args.args[1].getvalue())).convert("RGBA")
    assert cutout.getpixel((0, 0))[3] == 0


def test_a_clean_logo_is_left_alone(tenant_ctx, config):
    clean = Image.new("RGBA", (300, 200), (0, 0, 0, 0))
    for x in range(100, 200):
        for y in range(60, 140):
            clean.putpixel((x, y), (20, 60, 160, 255))
    with mock.patch("apps.core.storage.get_s3_client", return_value=_logo(config, clean)):
        assert site_qa._clean_logo(config) is None


# ── who looks ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("text", "vision", "key", "expected"),
    [
        ("anthropic", "", "", "anthropic"),
        ("agentc", "", "sk-key", "anthropic"),  # prod: text on the hub, images on the API
        ("agentc", "cli", "", "cli"),  # local dev
        ("agentc", "", "", None),
    ],
)
def test_image_calls_have_their_own_provider(settings, text, vision, key, expected):
    settings.AI_PROVIDER, settings.AI_VISION_PROVIDER, settings.ANTHROPIC_API_KEY = text, vision, key
    assert core_ai.vision_provider() == expected


def test_the_cli_reads_the_images_from_disk(settings):
    settings.AI_PROVIDER, settings.AI_VISION_PROVIDER, settings.ANTHROPIC_API_KEY = "agentc", "cli", ""
    seen = {}

    def fake_cli(system, user, output_model, model, effort=None, *, read_dir=None):
        import os

        seen.update(user=user, files=sorted(os.listdir(read_dir)), effort=effort)
        return PageReview(findings=[]), Decimal("0"), model

    image = {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}}
    with mock.patch.object(core_ai, "_cli_structured", side_effect=fake_cli):
        core_ai.structured_messages(
            system="s",
            messages=[{"role": "user", "content": [{"type": "text", "text": "Page: home"}, image, image]}],
            output_model=PageReview,
            model="claude-opus-5-5",
            max_tokens=100,
            effort="medium",
            language=None,
        )
    assert seen["files"] == ["image-1.jpg", "image-2.jpg"] and seen["effort"] == "medium"
    assert seen["user"].startswith("Page: home\n[image file: ") and "image-2.jpg]" in seen["user"]
