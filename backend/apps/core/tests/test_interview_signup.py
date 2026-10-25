"""Email verify creates the tenant; its site is built once its card is in (the
trial running), never before. Interview tenants never get an up-front
whole-site compose (pages build per interview milestone)."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_signup_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    from django.db import connection

    tenants = list(Tenant.objects.filter(slug__in=["iv-studio-test", "iv-again-test"]))
    with connection.cursor() as c:  # raw: the ORM cascade reaches billing_payment, a tenant table
        c.execute("DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)", [[t.id for t in tenants]])
    for tenant in tenants:
        tenant.delete(force_drop=True)


@pytest.fixture()
def starter():
    plan, _ = PlatformPlan.objects.update_or_create(
        name="starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "is_active": True,
            "prices": {"USD": {"amount_cents": 1990, "stripe_price_id": "price_test_signup"}},
        },
    )
    return plan


def _verify(brand, **extra):
    token = create_signup_token("iv@test.dev", "Iv", brand, "global")
    client = APIClient(HTTP_HOST="localhost")
    with mock.patch("apps.core.tasks.provision_tenant.delay") as delay:
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token, **extra}, format="json")
    return resp, delay


def _trial(tenant, plan):
    user, _ = User.objects.get_or_create(email=tenant.owner_email, region="global", defaults={"name": "Iv"})
    return PlatformSubscription.objects.create(
        tenant=tenant, user=user, plan=plan, status="trialing", provider="stripe", provider_subscription_id="sub_iv"
    )


def test_verify_takes_the_card_before_building_anything(starter):
    resp, delay = _verify("Iv Studio Test")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["needs_card"] is True
    assert body["plan"]["name"] == "starter" and body["plan"]["trial_days"] == 14
    tenant = Tenant.objects.get(slug="iv-studio-test")
    assert tenant.wizard_state["flow"] == "interview"
    assert tenant.wizard_state["answers"]["goals"] == []
    assert tenant.wizard_state["answers"]["style"]
    assert tenant.template_seed_status == "pending"
    delay.assert_not_called()


def test_a_new_coach_is_asked_her_header_and_then_her_footer(starter):
    """The old wizard's "classic" header default once settled the header question unasked."""
    from apps.tenant_config import interview_brief as brief

    _verify("Iv Studio Test")
    answers = Tenant.objects.get(slug="iv-studio-test").wizard_state["answers"]
    assert [f.id for f in brief.missing(answers)][-2:] == ["navbar_layout", "footer_layout"]


def test_the_trial_starting_builds_the_site_once(starter):
    _verify("Iv Studio Test")
    tenant = Tenant.objects.get(slug="iv-studio-test")
    with mock.patch("apps.core.tasks.provision_tenant.delay") as delay:
        sub = _trial(tenant, starter)
        sub.save()  # the webhook and the return from Checkout both land
    delay.assert_called_once_with(tenant.id, "iv@test.dev", "Iv", "general")
    resp, again = _verify("Iv Studio Test")
    assert resp.status_code == 200 and resp.json()["needs_card"] is False
    again.assert_not_called()


def test_back_from_checkout_syncs_the_session(starter):
    _verify("Iv Studio Test")
    with mock.patch(
        "apps.billing.views.webhooks_platform.sync_platform_checkout_session",
        side_effect=lambda t, session_id: _trial(t, starter),
    ) as sync:
        resp, delay = _verify("Iv Studio Test", session_id="cs_test_123")
    sync.assert_called_once()
    assert resp.json()["needs_card"] is False
    delay.assert_called_once()


def test_signup_checkout_opens_a_trial_for_every_new_site(starter):
    from apps.billing.providers.types import CheckoutSession

    _verify("Iv Studio Test")
    tenant = Tenant.objects.get(slug="iv-studio-test")
    token = create_signup_token("iv@test.dev", "Iv", "Iv Studio Test", "global")
    client = APIClient(HTTP_HOST="localhost")
    provider = mock.Mock(name="stripe")
    provider.create_checkout_session.return_value = CheckoutSession(
        url="https://checkout.example/cs_1", expires_at=None, provider_session_id="cs_1"
    )
    with mock.patch("apps.billing.providers.get_provider", return_value=provider):
        resp = client.post("/api/v1/onboarding/signup/checkout/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["checkout_url"] == "https://checkout.example/cs_1"
    kwargs = provider.create_checkout_session.call_args.kwargs
    assert kwargs["tenant"] == tenant and kwargs["trial_days"] == 14
    assert kwargs["user"].email == "iv@test.dev"  # the owner's platform account, made here
    assert kwargs["success_url"] == f"http://localhost/signup/verify?token={token}&checkout=success"
    # Once a plan runs, a second Checkout would bill twice.
    with mock.patch("apps.core.tasks.provision_tenant.delay"):
        _trial(tenant, starter)
    resp = client.post("/api/v1/onboarding/signup/checkout/", {"token": token}, format="json")
    assert resp.status_code == 409


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
        requires_plan=False,  # an old-wizard tenant, from before the card came first
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
            "label": "What you offer",
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


def test_extract_doc_flags_a_studio_name_its_bio_disagrees_with():
    client = APIClient(HTTP_HOST="localhost")
    facts = [
        {"field": "teaches", "label": "What you offer", "value": "Face yoga and yoga", "items": ["Face yoga", "Yoga"]}
    ]
    with mock.patch("apps.core.onboarding.about_check.analyze", return_value={"facts": facts, "summary": ""}):
        post = lambda brand: client.post(  # noqa: E731
            "/api/v1/onboarding/extract-doc/", {"text": "I teach face yoga.", "brand": brand}, format="json"
        ).json()
        assert post("GS Polly Dance Studio")["conflict"] == {"name_says": "dance", "bio_says": "face yoga and yoga"}
        assert post("Zen Yoga Studio")["conflict"] is None


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
            about_check.FactItem(field="location", value="Brooklyn", items=["not a tile question"]),
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
    assert by_field["location"]["items"] == []


def test_analyze_keeps_its_result_when_the_ai_probe_blips():
    """Provisioning reads the About step's analysis again; a hub health probe
    that times out in between must not throw it away."""
    import uuid

    from apps.core import ai as core_ai
    from apps.core.onboarding import about_check

    parsed = about_check.AboutAnalysis(facts=[about_check.FactItem(field="story", value="I teach yoga.")])
    text = f"bio {uuid.uuid4()}"
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch.object(core_ai, "structured", return_value=(parsed, 0.0, "m")),
    ):
        first = about_check.analyze(text)
    assert first["facts"]
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        assert about_check.analyze(text) == first
