"""A branding upload's Photo title is stored data that visitors read as alt text: it is in the
site's language, whatever language the creator who uploaded it reads the studio in."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from django.conf import settings
from django.test import Client

from apps.accounts.models import User
from apps.core.storage import build_s3_path
from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_branding_photo_title_follows_the_site_not_the_creator(tenant_ctx):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale="en")
    owner = User.objects.create_user(email="owner@branding.com", name="Owner", password="x", role="owner")
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "user_id": owner.id,
            "tenant_id": tenant_ctx.schema_name,
            "role": owner.role,
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    client = Client()
    client.cookies["contentor_access_token"] = token
    client.cookies["user-locale"] = "tr"  # she reads the studio in Turkish; the site is English

    response = client.post(
        "/api/v1/upload/complete/",
        {"s3_key": build_s3_path("branding", "logo.png"), "category": "branding"},
        content_type="application/json",
        HTTP_HOST="shared-test.localhost",
    )

    assert response.status_code == 200
    assert Photo.objects.get(pk=response.json()["photo_id"]).title == "Branding"
