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

    tenants = list(Tenant.objects.filter(slug__in=["new-site-1a5701", "new-site-1a5702"]))
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


def _verify(site, **extra):
    token = create_signup_token("iv@test.dev", "Iv", site, "global")
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
    resp, delay = _verify("new-site-1a5701")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["needs_card"] is True
    assert body["plan"]["name"] == "starter" and body["plan"]["trial_days"] == 14
    tenant = Tenant.objects.get(slug="new-site-1a5701")
    assert tenant.wizard_state["flow"] == "interview"
    assert tenant.wizard_state["answers"]["goals"] == []
    assert tenant.wizard_state["answers"]["style"]
    assert tenant.template_seed_status == "pending"
    delay.assert_not_called()


def test_a_new_coach_is_asked_her_header_and_then_her_footer(starter):
    """The old wizard's "classic" header default once settled the header question unasked."""
    from apps.tenant_config import interview_brief as brief

    _verify("new-site-1a5701")
    answers = Tenant.objects.get(slug="new-site-1a5701").wizard_state["answers"]
    assert [f.id for f in brief.missing(answers)][-2:] == ["navbar_layout", "footer_layout"]


def test_a_new_site_is_named_in_setup_after_her_bio(starter):
    from apps.tenant_config import interview_brief as brief

    _verify("new-site-1a5701")
    tenant = Tenant.objects.get(slug="new-site-1a5701")
    assert tenant.name == "New site" and tenant.schema_name == "new-site-1a5701"
    assert [f.id for f in brief.missing(brief.answers_of(tenant))][:3] == ["bio", "site_name", "teaches"]


def test_the_trial_starting_builds_the_site_once(starter):
    _verify("new-site-1a5701")
    tenant = Tenant.objects.get(slug="new-site-1a5701")
    with mock.patch("apps.core.tasks.provision_tenant.delay") as delay:
        sub = _trial(tenant, starter)
        sub.save()  # the webhook and the return from Checkout both land
    delay.assert_called_once_with(tenant.id, "iv@test.dev", "Iv", "general")
    resp, again = _verify("new-site-1a5701")
    assert resp.status_code == 200 and resp.json()["needs_card"] is False
    again.assert_not_called()


def test_back_from_checkout_syncs_the_session(starter):
    _verify("new-site-1a5701")
    with mock.patch(
        "apps.billing.views.webhooks_platform.sync_platform_checkout_session",
        side_effect=lambda t, session_id: _trial(t, starter),
    ) as sync:
        resp, delay = _verify("new-site-1a5701", session_id="cs_test_123")
    sync.assert_called_once()
    assert resp.json()["needs_card"] is False
    delay.assert_called_once()


def test_signup_checkout_opens_a_trial_for_every_new_site(starter):
    from apps.billing.providers.types import CheckoutSession

    _verify("new-site-1a5701")
    tenant = Tenant.objects.get(slug="new-site-1a5701")
    token = create_signup_token("iv@test.dev", "Iv", "new-site-1a5701", "global")
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

    _verify("new-site-1a5702")
    tenant = Tenant.objects.get(slug="new-site-1a5702")
    Tenant.objects.filter(pk=tenant.pk).update(
        created_at=timezone.now() - timedelta(minutes=10),
        wizard_state={"answers": {"niche": "yoga", "description": "Old wizard answers"}},
        requires_plan=False,  # an old-wizard tenant, from before the card came first
    )
    resp, delay = _verify("new-site-1a5702")
    assert resp.status_code == 200
    delay.assert_called_once()
    state = Tenant.objects.get(pk=tenant.pk).wizard_state
    assert state["flow"] == "interview"
    assert state["answers"]["description"] == "Old wizard answers"


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


def test_analyze_in_the_creators_language_is_reused_by_provisioning_in_english():
    """The About step runs in the creator's language, provisioning (a Celery task) in English: one model call."""
    import uuid

    from django.utils import translation

    from apps.core import ai as core_ai
    from apps.core.onboarding import about_check
    from apps.core.tests.i18n_utils import translated

    parsed = about_check.AboutAnalysis(facts=[about_check.FactItem(field="story", value="I teach yoga.")])
    text = f"bio {uuid.uuid4()}"
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch.object(core_ai, "structured", return_value=(parsed, 0.0, "m")) as model,
    ):
        with translation.override("tr"):
            step = about_check.analyze(text)
        with translation.override("en"):
            provisioning = about_check.analyze(text)
    assert model.call_count == 1
    assert [f["value"] for f in provisioning["facts"]] == ["I teach yoga."]
    assert step["facts"][0]["label"] == translated("Your story & background")
    assert provisioning["facts"][0]["label"] == "Your story & background"


def test_signup_checkout_failure_speaks_the_page_language_without_raw_provider_text(starter):
    """Reaches a `_()` in signup_checkout (a throwaway `_` once shadowed gettext); never shows Stripe's text."""
    from apps.billing.providers.types import ProviderError
    from apps.core.tests.i18n_utils import translated

    _verify("new-site-1a5701")
    token = create_signup_token("iv@test.dev", "Iv", "new-site-1a5701", "global")
    client = APIClient(HTTP_HOST="localhost")
    client.cookies["NEXT_LOCALE"] = "tr"
    provider = mock.Mock(name="stripe")
    provider.create_checkout_session.side_effect = ProviderError("Stripe is not configured (STRIPE_SECRET_KEY missing)")
    with mock.patch("apps.billing.providers.get_provider", return_value=provider):
        resp = client.post("/api/v1/onboarding/signup/checkout/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == translated("Payment could not be processed. Please try again.")
