"""The generated-logo wiring in the setup interview."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.media.models import Photo
from apps.tenant_config import interview
from apps.tenant_config import interview_milestones as ms
from apps.tenant_config.logo_gen import pipeline
from apps.tenant_config.models import LogoCandidate, TenantConfig

pytestmark = pytest.mark.django_db


@pytest.fixture
def config(tenant_with_interview):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Elara Face Yoga")
    cfg.style, cfg.palette = "atelier", ""
    cfg.setup_flow = {
        "status": "active",
        "interview": {"turns": [], "fired": []},
        "draft_status": {},
        "page_builds": {},
    }
    cfg.save()
    return cfg


@pytest.fixture
def ready_batch(tenant_with_interview, config, settings):
    settings.LOGO_GEN_ENABLED = True
    tenant, answers = tenant_with_interview
    state = {
        **tenant.wizard_state,
        "logo_batch": {"id": "b9", "state": "ready", "started_at": "2026-10-09T20:00:00+00:00"},
    }
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)
    tenant.refresh_from_db()
    png = Photo.objects.create(s3_key="tenants/shared-test/logo-candidates/b9/cand_1.png", title="c")
    icon = Photo.objects.create(s3_key="tenants/shared-test/logo-candidates/b9/icon_1.png", title="i")
    a = LogoCandidate.objects.create(
        batch="b9",
        position=1,
        concept="a lotus face",
        archetype="mark_name",
        prompt="p",
        png=png,
        icon=icon,
        rank=2,
        vector={"view_box": [100, 50], "paths": [{"d": "M1 1L2 2Z", "role": "primary"}]},
    )
    b = LogoCandidate.objects.create(
        batch="b9",
        position=2,
        concept="the name alone",
        archetype="wordmark",
        prompt="p",
        png=png,
        rank=1,
        vector={"view_box": [100, 30], "paths": [{"d": "M1 1L3 3Z", "role": "ink"}]},
    )
    LogoCandidate.objects.create(
        batch="b9", position=3, concept="x", archetype="emblem", prompt="p", state="rejected", reject_reason="read_back"
    )
    return tenant, answers, a, b


def test_due_includes_logo_generate_only_when_enabled(tenant_with_interview, settings, monkeypatch):
    tenant, answers = tenant_with_interview
    monkeypatch.setattr(ms.brief, "settled", lambda a, needs: True)
    settings.LOGO_GEN_ENABLED = True
    assert "logo:generate" in ms._due(tenant, answers)
    settings.LOGO_GEN_ENABLED = False
    assert "logo:generate" not in ms._due(tenant, answers)


def test_start_logo_calls_start_batch(tenant_with_interview, monkeypatch):
    tenant, answers = tenant_with_interview
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    ms._start(tenant, answers, "logo:generate")
    assert calls == [{}]


def test_apply_style_redispatches_when_the_look_changes(ready_batch, monkeypatch):
    tenant, *_ = ready_batch
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    ms.apply_style(tenant, "atelier", "")  # unchanged look
    assert calls == []
    ms.apply_style(tenant, "atelier", "fig")  # new palette
    ms.apply_style(tenant, "dojo", "")  # new style
    assert calls == [{}, {}]


def test_apply_style_without_a_batch_does_not_dispatch(tenant_with_interview, config, monkeypatch):
    tenant, _ = tenant_with_interview
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    ms.apply_style(tenant, "dojo", "")
    assert calls == []


def test_logo_cards_generated_block_is_ranked_and_ready_only(ready_batch):
    tenant, answers, a, b = ready_batch
    gen = ms.logo_cards(tenant, answers)["generated"]
    assert gen["state"] == "ready"
    assert [o["value"] for o in gen["options"]] == [f"gen:{b.pk}", f"gen:{a.pk}"]
    assert gen["options"][0]["label"] == "the name alone" and gen["options"][0]["rank"] == 1
    assert gen["options"][0]["image_url"].startswith("http")


def test_logo_cards_building_and_none(tenant_with_interview, settings):
    tenant, answers = tenant_with_interview
    assert ms.logo_cards(tenant, answers)["generated"] == {"state": "none", "options": []}
    state = {
        **tenant.wizard_state,
        "logo_batch": {"id": "b", "state": "building", "started_at": "2099-01-01T00:00:00+00:00"},
    }
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)
    tenant.refresh_from_db()
    assert ms.logo_cards(tenant, answers)["generated"]["state"] == "building"


def test_choose_generated_applies_logo_icon_and_recipe(ready_batch):
    tenant, answers, a, b = ready_batch
    ms.choose(tenant, answers, "site_logo", f"gen:{a.pk}")
    cfg = TenantConfig.objects.first()
    assert answers["logo"] == {"mode": "generated", "candidate_id": a.pk} and answers["site_logo"] == f"gen:{a.pk}"
    assert cfg.logo_id == a.png_id and cfg.icon_id == a.icon_id
    assert cfg.logo_recipe["mark"]["type"] == "generated" and cfg.logo_recipe["mark"]["name_in_mark"] is True
    assert cfg.logo_recipe["colors"]["roles"]["primary"].startswith("#")
    assert cfg.navbar_config["show_brand_name"] is False and cfg.navbar_config["logo_size"] == "lg"


def test_choose_generated_wordmark_leaves_icon_unset(ready_batch):
    tenant, answers, a, b = ready_batch
    ms.choose(tenant, answers, "site_logo", f"gen:{b.pk}")
    cfg = TenantConfig.objects.first()
    assert cfg.logo_id == b.png_id and cfg.icon_id is None


def test_choose_generated_refuses_rejected_or_unknown(ready_batch):
    tenant, answers, a, b = ready_batch
    rejected = LogoCandidate.objects.get(batch="b9", position=3)
    for value in (f"gen:{rejected.pk}", "gen:999999", "gen:abc"):
        with pytest.raises(ms.ChoiceError) as exc:
            ms.choose(tenant, answers, "site_logo", value)
        assert str(exc.value) == "unknown_logo"


def test_interview_state_exposes_logo_batch(ready_batch, config):
    tenant, *_ = ready_batch
    state = interview.interview_state(tenant, config.setup_flow)
    assert state["logo_batch"]["state"] == "ready"


def test_logo_more_endpoint_starts_a_batch_and_returns_cards(ready_batch, monkeypatch):
    tenant, *_ = ready_batch
    calls = []
    monkeypatch.setattr(pipeline, "start_batch", lambda t, **kw: calls.append(kw) or "bid")
    coach = User.objects.create_user(email="c@lg.test", name="C", password="x", role="owner", is_staff=True)  # noqa: S106
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=coach)
    resp = client.post("/api/v1/admin/setup-flow/logo-more/")
    assert resp.status_code == 200 and calls == [{"more": True}]
    assert resp.json()["kind"] == "logo" and "generated" in resp.json()
