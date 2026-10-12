"""Email verify creates AND provisions the site; interview tenants never get
an up-front whole-site compose (pages build per interview milestone)."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    for tenant in Tenant.objects.filter(slug__in=["iv-studio-test", "iv-again-test"]):
        tenant.delete(force_drop=True)


def _verify(brand):
    token = create_signup_token("iv@test.dev", "Iv", brand, "global")
    client = APIClient(HTTP_HOST="localhost")
    with mock.patch("apps.core.tasks.provision_tenant.delay") as delay:
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
    return resp, delay


def test_verify_marks_interview_and_enqueues_provisioning():
    resp, delay = _verify("Iv Studio Test")
    assert resp.status_code == 201, resp.content
    tenant = Tenant.objects.get(slug="iv-studio-test")
    assert tenant.wizard_state["flow"] == "interview"
    assert tenant.wizard_state["answers"]["goals"] == []
    assert tenant.wizard_state["answers"]["style"]
    delay.assert_called_once_with(tenant.id, "iv@test.dev", "Iv", "general")


def test_reverify_does_not_enqueue_twice():
    _verify("Iv Again Test")
    resp, delay = _verify("Iv Again Test")
    assert resp.status_code == 200
    delay.assert_not_called()


def test_provision_skips_whole_site_compose_for_interview_tenants():
    from apps.core import tasks

    assert tasks._should_compose_site(mock.Mock(wizard_state={"flow": "interview"})) is False
    assert tasks._should_compose_site(mock.Mock(wizard_state={})) is True


def test_suite_never_enqueues_real_provisioning():
    """Verify enqueues provisioning on commit; under pytest that must never
    reach the dev stack's real Celery broker (it would provision whatever dev
    tenant shares the test tenant's id)."""
    from apps.core import tasks

    assert isinstance(tasks.provision_tenant.delay, mock.Mock)


def test_reverify_restarts_provisioning_that_never_ran():
    """Review finding 6: an old-wizard tenant still 'pending' at deploy, or a
    lost enqueue, must not leave the verify page polling forever."""
    from datetime import timedelta

    from django.utils import timezone

    _verify("Iv Again Test")
    tenant = Tenant.objects.get(slug="iv-again-test")
    Tenant.objects.filter(pk=tenant.pk).update(
        created_at=timezone.now() - timedelta(minutes=10),
        wizard_state={"answers": {"niche": "yoga", "description": "Old wizard answers"}},
    )
    resp, delay = _verify("Iv Again Test")
    assert resp.status_code == 200
    delay.assert_called_once()
    state = Tenant.objects.get(pk=tenant.pk).wizard_state
    assert state["flow"] == "interview"
    assert state["answers"]["description"] == "Old wizard answers"


def test_verify_records_initial_about_from_token():
    from django.core.cache import cache

    about_id = "test-about-123"
    cache.set(f"signup:about:{about_id}", "I have taught vinyasa yoga for 10 years.", timeout=60)
    token = create_signup_token("iv@test.dev", "Iv", "Iv About Test", "global", about_id=about_id)
    client = APIClient(HTTP_HOST="localhost")
    with mock.patch("apps.core.tasks.provision_tenant.delay"):
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
    assert resp.status_code == 201
    tenant = Tenant.objects.get(slug="iv-about-test")
    assert tenant.wizard_state["initial_about"] == "I have taught vinyasa yoga for 10 years."
    tenant.delete(force_drop=True)


def test_extract_doc_endpoint():
    from django.core.files.uploadedfile import SimpleUploadedFile

    client = APIClient(HTTP_HOST="localhost")

    # Text via JSON payload
    resp = client.post("/api/v1/onboarding/extract-doc/", {"text": "Hello world from bio"}, format="json")
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Hello world from bio"
    assert "facts" in data
    assert "summary" in data

    # File upload via multipart
    f = SimpleUploadedFile("bio.txt", b"Certified coach since 2015", content_type="text/plain")
    resp = client.post("/api/v1/onboarding/extract-doc/", {"file": f}, format="multipart")
    assert resp.status_code == 200
    assert resp.json()["text"] == "Certified coach since 2015"


def test_extract_doc_returns_analyzed_facts_in_real_time():
    client = APIClient(HTTP_HOST="localhost")
    sample_facts = [
        {
            "field": "teaches",
            "label": "What you teach",
            "value": "Vinyasa yoga",
            "answers": "Homepage hero & course catalog",
        }
    ]
    with mock.patch(
        "apps.core.onboarding.about_check.analyze", return_value={"facts": sample_facts, "summary": "Found yoga."}
    ):
        resp = client.post(
            "/api/v1/onboarding/extract-doc/",
            {"text": "I teach vinyasa yoga in Brooklyn."},
            format="json",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["facts"] == sample_facts
    assert data["summary"] == "Found yoga."


def test_extract_doc_rejects_empty():
    client = APIClient(HTTP_HOST="localhost")
    resp = client.post("/api/v1/onboarding/extract-doc/", {"text": "   "}, format="json")
    assert resp.status_code == 400
    assert "detail" in resp.json()


def test_apply_initial_about_applies_facts_and_records_turn(db):
    import uuid

    from django_tenants.utils import tenant_context

    from apps.core.models import Tenant
    from apps.tenant_config import interview
    from apps.tenant_config import interview_brief as brief
    from apps.tenant_config.models import TenantConfig

    uid = uuid.uuid4().hex[:8]
    tenant = Tenant.objects.create(
        schema_name=f"about_{uid}",
        slug=f"about-{uid}",
        name="About Apply Tenant",
        owner_email="apply@test.com",
    )
    tenant.create_schema(verbosity=0)
    try:
        with tenant_context(tenant):
            TenantConfig.objects.create(brand_name="About Apply Tenant")
            sample_facts = [
                {
                    "field": "story",
                    "label": "Your story & background",
                    "value": "Started teaching after marathon training.",
                },
                {"field": "credentials", "label": "Training & certifications", "value": "200hr RYT and NASM CPT."},
            ]
            with mock.patch("apps.core.onboarding.about_check.analyze", return_value={"facts": sample_facts}):
                ok = interview.apply_initial_about(tenant, "My bio text here")
                assert ok is True

            prefills = tenant.wizard_state.get("about_prefills") or {}
            assert prefills.get("story") == "Started teaching after marathon training."
            assert prefills.get("credentials") == "200hr RYT and NASM CPT."

            answers = brief.answers_of(tenant)
            # Verify steps are NOT skipped (remain in missing)
            missing_ids = [f.id for f in brief.missing(answers)]
            assert "story" in missing_ids
            assert "credentials" in missing_ids

            # Verify interview state does not stall and pops initial_about
            tenant.wizard_state["initial_about"] = "Some text"
            tenant.wizard_state.pop("initial_about_done", None)
            from apps.tenant_config import setup_flow

            state = setup_flow._interview_state(tenant, {})
            assert state is not None
            assert "initial_about" not in (tenant.wizard_state or {})
            assert tenant.wizard_state.get("initial_about_done") is True
    finally:
        tenant.delete(force_drop=True)


def test_analyze_gives_trimmed_items_for_tile_questions():
    import uuid

    from apps.core import ai as core_ai
    from apps.core.onboarding import about_check

    parsed = about_check.AboutAnalysis(
        facts=[
            about_check.FactItem(
                field="credentials",
                value="Face yoga teacher",
                items=[" BBM Level 1. ", "bbm level 1.", "Yin Yoga & Anatomy training."],
            ),
            about_check.FactItem(field="teaches", value="Face yoga", items=["not a tile question"]),
        ]
    )
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch.object(core_ai, "structured", return_value=(parsed, 0.0, "m")),
    ):
        facts = about_check.analyze(f"bio {uuid.uuid4()}")["facts"]
    by_field = {f["field"]: f for f in facts}
    assert by_field["credentials"]["items"] == ["BBM Level 1.", "Yin Yoga & Anatomy training."]
    assert by_field["teaches"]["items"] == []
