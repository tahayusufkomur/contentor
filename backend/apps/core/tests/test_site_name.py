"""A site's name and address: a temporary address at signup, renamed when the
creator names the site in /setup; the schema and storage folder stay put."""

import pytest
from django.db import connection

from apps.core.models import Domain, Tenant
from apps.core.onboarding import site_name
from apps.core.storage import storage_folder

pytestmark = pytest.mark.django_db(transaction=True)

SITE = "new-site-5a5a5a"


@pytest.fixture()
def tenant(restore_public, settings):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t = Tenant.objects.create(
            schema_name=SITE, name=site_name.PLACEHOLDER_NAME, slug=SITE, subdomain=SITE, owner_email="n@x.com"
        )
        Domain.objects.create(domain=f"{SITE}.{settings.CONTENTOR_DOMAIN}", tenant=t, is_primary=True)
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name=SITE).delete()


def test_a_temporary_address_is_free_and_new():
    site = site_name.placeholder_site()
    assert site_name.is_placeholder(site) and not Tenant.objects.filter(slug=site).exists()


def test_naming_moves_the_address_and_keeps_the_schema_and_files(tenant, settings):
    site_name.rename(tenant, "  Glow Yoga Loft ")
    fresh = Tenant.objects.get(pk=tenant.pk)
    assert (fresh.name, fresh.slug, fresh.subdomain, fresh.schema_name) == (
        "Glow Yoga Loft",
        "glow-yoga-loft",
        "glow-yoga-loft",
        SITE,
    )
    assert list(Domain.objects.filter(tenant=fresh).values_list("domain", flat=True)) == [
        f"glow-yoga-loft.{settings.CONTENTOR_DOMAIN}"
    ]
    assert storage_folder(fresh) == SITE  # what she stored before the name stays hers
    # Named again (she went back): the address follows; the same name again is fine.
    site_name.rename(fresh, "Glow")
    site_name.rename(fresh, "glow")
    assert Tenant.objects.get(pk=tenant.pk).slug == "glow"


@pytest.mark.parametrize(
    ("name", "why"), [("Shared Test", "brand_taken"), ("API", "brand_taken"), ("東京", "brand_unusable")]
)
def test_a_name_that_cannot_be_an_address_is_refused(tenant, name, why):
    with pytest.raises(site_name.NameRefusedError, match=why):
        site_name.rename(tenant, name)
    assert Tenant.objects.get(pk=tenant.pk).slug == SITE


def test_sites_named_at_signup_keep_their_folder(restore_public):
    named = Tenant(schema_name="glow_studio", slug="glow-studio")
    assert storage_folder(named) == "glow-studio"
