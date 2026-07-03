"""
Download views API tests.

Tests for:
  - GET/POST /api/v1/downloads/          (download_list_create)
  - PATCH/DELETE /api/v1/downloads/<pk>/  (download_detail)
  - GET /api/v1/downloads/<pk>/url/       (download_url)

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.downloads.models import DownloadFile
from apps.tags.models import Tag

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@downloadtest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@downloadtest.com", name="Student", password="secret123", role="student"
    )


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def free_download(tenant_ctx):
    return DownloadFile.objects.create(
        title="Free Ebook",
        file_url="downloads/free-ebook.pdf",
        file_size=1024,
        pricing_type="free",
        price=Decimal("0.00"),
    )


@pytest.fixture()
def paid_download(tenant_ctx):
    return DownloadFile.objects.create(
        title="Premium Guide",
        file_url="downloads/premium-guide.pdf",
        file_size=2048,
        pricing_type="paid",
        price=Decimal("29.00"),
    )


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests: download_list_create
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestDownloadListCreate:
    def test_get_lists_downloads_with_pagination(self, free_download, paid_download, owner):
        """GET returns paginated list of downloads."""
        client = make_client(owner)
        response = client.get("/api/v1/downloads/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 2

    def test_get_search_filter_by_title(self, free_download, paid_download, owner):
        """GET ?search= filters downloads by title."""
        client = make_client(owner)
        response = client.get("/api/v1/downloads/?search=Free")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["title"] == "Free Ebook"

    def test_get_unauthenticated_allowed(self, free_download):
        """GET is AllowAny — unauthenticated users can list downloads."""
        client = APIClient(HTTP_HOST=SHARED_DOMAIN)
        response = client.get("/api/v1/downloads/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data["results"]) >= 1

    def test_post_owner_creates_download(self, owner):
        """POST by owner creates a download and returns 201."""
        client = make_client(owner)
        payload = {
            "title": "New Download",
            "file_url": "downloads/new-file.pdf",
            "file_size": 512,
            "pricing_type": "free",
            "price": "0.00",
        }
        response = client.post("/api/v1/downloads/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "New Download"

    def test_post_owner_creates_download_without_file_url(self, owner, tenant_ctx):
        """POST without file_url (create-first, upload-after flow) returns 201."""
        client = make_client(owner)
        payload = {
            "title": "Pending Upload",
            "pricing_type": "free",
            "price": "0.00",
        }
        response = client.post("/api/v1/downloads/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "Pending Upload"
        assert data["file_url"] == ""

    def test_post_owner_creates_download_with_tags(self, owner, tenant_ctx):
        """POST with tag_ids persists M2M tags on the created download."""
        tag = Tag.objects.create(scope="download", name="E2E Tag")
        client = make_client(owner)
        payload = {
            "title": "Tagged Download",
            "pricing_type": "free",
            "price": "0.00",
            "tag_ids": [tag.id],
        }
        response = client.post("/api/v1/downloads/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "Tagged Download"
        tag_names = [t["name"] for t in data.get("tags", [])]
        assert "E2E Tag" in tag_names, f"Expected tag in response, got: {tag_names}"

    def test_post_student_forbidden(self, student):
        """POST by student returns 403."""
        client = make_client(student)
        payload = {
            "title": "Student Upload",
            "file_url": "downloads/student.pdf",
            "file_size": 256,
            "pricing_type": "free",
            "price": "0.00",
        }
        response = client.post("/api/v1/downloads/", data=payload, format="json")
        assert response.status_code == 403, response.content


# ---------------------------------------------------------------------------
# Tests: download_detail
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestDownloadDetail:
    def test_owner_updates_download(self, free_download, owner):
        """PATCH by owner updates the download."""
        client = make_client(owner)
        response = client.patch(
            f"/api/v1/downloads/{free_download.pk}/",
            data={"title": "Updated Ebook"},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["title"] == "Updated Ebook"

    def test_owner_deletes_download(self, free_download, owner):
        """DELETE by owner returns 204."""
        client = make_client(owner)
        response = client.delete(f"/api/v1/downloads/{free_download.pk}/")
        assert response.status_code == 204, response.content

    def test_student_patch_forbidden(self, free_download, student):
        """PATCH by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.patch(
            f"/api/v1/downloads/{free_download.pk}/",
            data={"title": "Hacked"},
            format="json",
        )
        assert response.status_code == 403, response.content

    def test_student_delete_forbidden(self, free_download, student):
        """DELETE by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.delete(f"/api/v1/downloads/{free_download.pk}/")
        assert response.status_code == 403, response.content


# ---------------------------------------------------------------------------
# Tests: download_url
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestDownloadUrl:
    @patch("apps.downloads.views.generate_presigned_download_url", return_value="https://fake-s3.example.com/signed")
    @patch("apps.downloads.views.ContentAccessService")
    def test_free_file_returns_presigned_url(self, mock_access_cls, mock_presign, free_download, owner):
        """Authenticated user gets a presigned URL for a free file."""
        mock_service = mock_access_cls.return_value
        mock_service.check_access.return_value = True

        client = make_client(owner)
        response = client.get(f"/api/v1/downloads/{free_download.pk}/url/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["url"] == "https://fake-s3.example.com/signed"
        mock_presign.assert_called_once_with(free_download.file_url)

    @patch("apps.downloads.views.generate_presigned_download_url", return_value="https://fake-s3.example.com/signed")
    @patch("apps.downloads.views.ContentAccessService")
    def test_free_file_increments_download_count(self, mock_access_cls, mock_presign, free_download, owner):
        """Download count is incremented after a successful download URL request."""
        mock_service = mock_access_cls.return_value
        mock_service.check_access.return_value = True

        assert free_download.download_count == 0
        client = make_client(owner)
        client.get(f"/api/v1/downloads/{free_download.pk}/url/")
        free_download.refresh_from_db()
        assert free_download.download_count == 1

    @patch("apps.downloads.views.ContentAccessService")
    def test_paid_file_without_purchase_returns_403(self, mock_access_cls, paid_download, student):
        """Paid file without purchase returns 403."""

        from apps.core.access import AccessInfo

        mock_service = mock_access_cls.return_value
        mock_service.check_access.return_value = False
        mock_service.get_access_info.return_value = AccessInfo(
            has_access=False,
            pricing_type="paid",
            price=Decimal("29.00"),
            currency="TRY",
            unlock_methods=["purchase"],
        )

        client = make_client(student)
        response = client.get(f"/api/v1/downloads/{paid_download.pk}/url/")
        assert response.status_code == 403, response.content
        data = response.json()
        assert data["detail"] == "You do not have access to this file."
        assert data["access_info"]["has_access"] is False

    def test_unauthenticated_returns_401_or_403(self, free_download):
        """Unauthenticated request to download_url is rejected."""
        client = APIClient(HTTP_HOST=SHARED_DOMAIN)
        response = client.get(f"/api/v1/downloads/{free_download.pk}/url/")
        assert response.status_code in (401, 403), response.content

    @patch("apps.downloads.views.ContentAccessService")
    def test_empty_file_url_returns_404_and_does_not_increment_count(self, mock_access_cls, owner, tenant_ctx):
        """download_url for a file_url='' download returns 404; download_count stays 0."""
        orphan = DownloadFile.objects.create(
            title="Orphan Pending",
            file_url="",
            pricing_type="free",
            price=Decimal("0.00"),
        )
        mock_service = mock_access_cls.return_value
        mock_service.check_access.return_value = True

        client = make_client(owner)
        response = client.get(f"/api/v1/downloads/{orphan.pk}/url/")
        assert response.status_code == 404, response.content
        orphan.refresh_from_db()
        assert orphan.download_count == 0


# ---------------------------------------------------------------------------
# Tests: orphan (file_url="") visibility
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestOrphanVisibility:
    @pytest.fixture()
    def orphan_download(self, tenant_ctx):
        return DownloadFile.objects.create(
            title="Orphan Pending Upload",
            file_url="",
            pricing_type="free",
            price=Decimal("0.00"),
        )

    def test_student_list_excludes_empty_file_url(self, orphan_download, student):
        """Students must NOT see downloads with file_url=''."""
        client = make_client(student)
        response = client.get("/api/v1/downloads/")
        assert response.status_code == 200, response.content
        titles = [r["title"] for r in response.json()["results"]]
        assert "Orphan Pending Upload" not in titles

    def test_unauthenticated_list_excludes_empty_file_url(self, orphan_download):
        """Unauthenticated users must NOT see downloads with file_url=''."""
        client = APIClient(HTTP_HOST=SHARED_DOMAIN)
        response = client.get("/api/v1/downloads/")
        assert response.status_code == 200, response.content
        titles = [r["title"] for r in response.json()["results"]]
        assert "Orphan Pending Upload" not in titles

    def test_owner_list_includes_empty_file_url(self, orphan_download, owner):
        """Owners MUST see downloads with file_url='' (pending upload rows)."""
        client = make_client(owner)
        response = client.get("/api/v1/downloads/")
        assert response.status_code == 200, response.content
        titles = [r["title"] for r in response.json()["results"]]
        assert "Orphan Pending Upload" in titles
