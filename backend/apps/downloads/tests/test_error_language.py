"""An error is worded in the reader's language (Task 4.3a): a creator reads it in theirs."""

import pytest

from apps.accounts.models import User
from apps.core.tests.i18n_utils import creator_client, translated
from apps.downloads.models import DownloadFile

pytestmark = pytest.mark.django_db(transaction=True)


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang.com", name="Owner", password="x", role="owner")
    download = DownloadFile.objects.create(title="Not uploaded yet", file_url="", is_published=True)
    client = creator_client(tenant_ctx, owner)

    response = client.get(f"/api/v1/downloads/{download.pk}/url/", HTTP_HOST="shared-test.localhost")

    assert response.status_code == 404
    assert response.json()["detail"] == translated("File not yet available.")
