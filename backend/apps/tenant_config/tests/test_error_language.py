"""An error is worded in the reader's language (Task 4.3d): a creator reads it in theirs."""

import pytest

from apps.accounts.models import User
from apps.core.tests.i18n_utils import creator_client, translated

pytestmark = pytest.mark.django_db(transaction=True)


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang.com", name="Owner", password="x", role="owner")
    client = creator_client(tenant_ctx, owner)

    response = client.patch(
        "/api/v1/admin/config/",
        {"timezone": "Not/AZone"},
        content_type="application/json",
        HTTP_HOST="shared-test.localhost",
    )

    assert response.status_code == 400
    assert response.json()["timezone"] == [translated("Unknown time zone.")]
