"""Every sign-in a creator can make on a site hands the browser the `user-locale` cookie the
studio reads, from their row. (Google sign-in sets it in the Next app, see
frontend-customer/src/__tests__/google-route.test.ts; impersonation is in test_impersonation.py.)"""

import pytest
from rest_framework.test import APIClient

from apps.accounts import login_code
from apps.accounts.models import User
from apps.accounts.tokens import create_magic_link_token

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def creator(tenant_ctx):
    return User.objects.create_user(email="pl@cookie.test", name="Pola", role="owner", preferred_locale="pl")


def test_magic_link_sign_in_sets_the_creators_language(creator, tenant_ctx):
    token = create_magic_link_token(creator.email, tenant_ctx.schema_name, tenant_ctx.slug)
    res = APIClient(HTTP_HOST=SHARED_DOMAIN).post("/api/v1/auth/magic-link/verify/", {"token": token}, format="json")
    assert res.status_code == 200, res.content
    assert res.cookies["user-locale"].value == "pl"


def test_code_sign_in_sets_the_creators_language(creator, tenant_ctx):
    code = login_code.issue(tenant_ctx.schema_name, creator.email)
    res = APIClient(HTTP_HOST=SHARED_DOMAIN).post(
        "/api/v1/auth/magic-link/verify-code/", {"email": creator.email, "code": code}, format="json"
    )
    assert res.status_code == 200, res.content
    assert res.cookies["user-locale"].value == "pl"
