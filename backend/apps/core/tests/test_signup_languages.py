"""A creator picks their site's language at signup (Task 3.3): the creator's language (the page's) and the
site's both land in wizard_state, provisioning uses them, and the dashboard lists each site's language."""

from unittest import mock

import pytest
from django.core.cache import cache
from django.db import connection
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_signup_token, verify_signup_token
from apps.core.models import Domain, Tenant
from apps.core.tasks import provision_tenant
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SIGNUP = "/api/v1/onboarding/signup/"
VERIFY = "/api/v1/onboarding/signup/verify/"
HOST = "localhost"
EMAIL = "lang@test.dev"


def _drop(*schemas):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        for schema in schemas:
            cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name__in=schemas).delete()
    connection.set_schema_to_public()


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    connection.set_schema_to_public()
    for tenant in Tenant.objects.filter(slug__startswith="lang-site-"):
        tenant.delete(force_drop=True)


def _signup(**extra):
    """POST the signup form; the verification token is the one in the emailed link."""
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        resp = APIClient(HTTP_HOST=HOST).post(SIGNUP, {"email": EMAIL, "name": "Lang", **extra}, format="json")
    assert resp.status_code == 200, resp.content
    link = send.call_args.kwargs["html"]
    token = link.split("token=")[1].split('"')[0].split("&")[0]
    return verify_signup_token(token), token


def _verify(token):
    return APIClient(HTTP_HOST=HOST).post(VERIFY, {"token": token}, format="json")


def test_signup_keeps_both_languages_in_wizard_state():
    payload, _ = _signup(locale="tr", site_locale="en")
    assert (payload["locale"], payload["site_locale"]) == ("tr", "en")
    # The temporary address the token names becomes the site: verify it under a name the cleanup knows.
    token = create_signup_token(EMAIL, "Lang", "lang-site-aaaa01", "global", payload["locale"], payload["site_locale"])
    resp = _verify(token)
    assert resp.status_code == 201, resp.content
    assert resp.json()["locale"] == "tr"
    state = Tenant.objects.get(slug="lang-site-aaaa01").wizard_state
    assert (state["locale"], state["site_locale"]) == ("tr", "en")


def test_site_language_defaults_to_the_creators():
    payload, _ = _signup(locale="de")
    assert (payload["locale"], payload["site_locale"]) == ("de", "de")


def test_a_hidden_language_becomes_english(settings):
    settings.ENABLED_LOCALES = ["en", "tr"]
    payload, _ = _signup(locale="tr", site_locale="pl")
    assert (payload["locale"], payload["site_locale"]) == ("tr", "en")


def test_signup_without_languages_is_english():
    payload, _ = _signup()
    assert (payload["locale"], payload["site_locale"]) == ("en", "en")


def test_the_authenticated_path_takes_both_too(restore_public):
    user = User.objects.create(email=EMAIL, name="Lang", region="global", role="coach", preferred_locale="tr")
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    url = "/api/v1/onboarding/signup/authenticated/"
    got = verify_signup_token(client.post(url, {}, format="json").json()["token"])
    assert (got["locale"], got["site_locale"]) == ("tr", "tr")
    got = verify_signup_token(client.post(url, {"site_locale": "de"}, format="json").json()["token"])
    assert (got["locale"], got["site_locale"]) == ("tr", "de")


def test_provisioning_gives_the_site_its_language_and_the_creator_theirs(restore_public):
    schema = "lang_site_prov"
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name=schema,
        name="Lang Prov",
        slug="lang-site-prov",
        subdomain="lang-site-prov",
        owner_email=EMAIL,
        region="global",
        wizard_state={"locale": "tr", "site_locale": "en"},
    )
    try:
        with mock.patch("apps.core.tasks._enqueue_compose_site"):
            provision_tenant.apply(args=(tenant.id, EMAIL, "Lang", "general"))
        tenant.refresh_from_db()
        assert tenant.provisioning_status == "ready"
        assert User.objects.get(email=EMAIL, region="global").preferred_locale == "tr"
        with tenant_context(tenant):
            assert TenantConfig.objects.get().default_locale == "en"
            assert User.objects.get(email=EMAIL).preferred_locale == "tr"
    finally:
        _drop(schema)


def test_a_site_in_another_language_skips_the_english_niche_seed(restore_public):
    schema = "lang_site_seed"
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name=schema,
        name="Lang Seed",
        slug="lang-site-seed",
        subdomain="lang-site-seed",
        owner_email=EMAIL,
        region="global",
        wizard_state={"locale": "en", "site_locale": "tr"},
    )
    try:
        with mock.patch("apps.core.tasks._enqueue_compose_site"):
            provision_tenant.apply(args=(tenant.id, EMAIL, "Lang", "general"))
        tenant.refresh_from_db()
        assert tenant.template_seed_status == "skipped"
        with tenant_context(tenant):
            assert TenantConfig.objects.get().default_locale == "tr"
    finally:
        _drop(schema)


def test_my_tenants_returns_each_sites_language(restore_public):
    owner = User.objects.create(email=EMAIL, name="Lang", region="global", role="coach")
    connection.set_schema_to_public()
    built = Tenant.objects.create(
        schema_name="lang_site_built",
        name="Built",
        slug="lang-site-built",
        subdomain="lang-site-built",
        owner_email=EMAIL,
        provisioning_status="ready",
    )
    Domain.objects.create(domain="lang-site-built.localhost", tenant=built, is_primary=True)
    built.create_schema(check_if_exists=True, verbosity=0)
    unbuilt = Tenant.objects.create(
        schema_name="lang_site_unbuilt",
        name="Unbuilt",
        slug="lang-site-unbuilt",
        subdomain="lang-site-unbuilt",
        owner_email=EMAIL,
        provisioning_status="pending",
        wizard_state={"site_locale": "de"},
    )
    Domain.objects.create(domain="lang-site-unbuilt.localhost", tenant=unbuilt, is_primary=True)
    try:
        with tenant_context(built):
            TenantConfig.objects.update_or_create(defaults={"brand_name": "Built", "default_locale": "tr"})
        cache.delete("tenant:lang_site_built:config")
        client = APIClient(HTTP_HOST="shared-test.localhost")
        client.force_authenticate(user=owner)
        rows = {r["slug"]: r for r in client.get("/api/v1/me/tenants/").json()}
        assert rows["lang-site-built"]["language"] == "tr"
        assert rows["lang-site-unbuilt"]["language"] == "de"
    finally:
        _drop("lang_site_built", "lang_site_unbuilt")
