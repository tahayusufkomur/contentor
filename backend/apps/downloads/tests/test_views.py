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
from apps.core.storage import build_s3_path
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
            "file_url": build_s3_path("download", "new-file.pdf"),
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

    def test_owner_reads_one_download(self, free_download, owner, student):
        """GET by owner returns the one download (its page); a student cannot."""
        response = make_client(owner).get(f"/api/v1/downloads/{free_download.pk}/")
        assert response.status_code == 200, response.content
        assert response.json()["id"] == free_download.pk
        assert make_client(student).get(f"/api/v1/downloads/{free_download.pk}/").status_code == 403

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
    def test_free_file_increments_download_count(self, mock_access_cls, mock_presign, free_download, owner, student):
        """A student's download is counted; the coach opening her own file is not."""
        mock_service = mock_access_cls.return_value
        mock_service.check_access.return_value = True

        assert free_download.download_count == 0
        make_client(student).get(f"/api/v1/downloads/{free_download.pk}/url/")
        free_download.refresh_from_db()
        assert free_download.download_count == 1

        assert make_client(owner).get(f"/api/v1/downloads/{free_download.pk}/url/").status_code == 200
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
            currency="USD",
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


# ---------------------------------------------------------------------------
# Tests: an unpublished (draft) download
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestUnpublishedDownload:
    @pytest.fixture()
    def draft(self, tenant_ctx):
        return DownloadFile.objects.create(
            title="Draft Guide",
            file_url="downloads/draft-guide.pdf",
            file_size=2048,
            pricing_type="paid",
            price=Decimal("29.00"),
            is_published=False,
        )

    def test_an_unpublished_download_is_hidden_from_students_and_the_store(
        self, draft, paid_download, owner, student, settings
    ):
        settings.BILLING_BYPASS_ENABLED = True
        buy = {"items": [{"content_type": "download", "object_id": draft.pk}]}
        for viewer in (None, student):
            client = make_client(viewer)
            titles = [r["title"] for r in client.get("/api/v1/downloads/").json()["results"]]
            assert titles == ["Premium Guide"]
            store = client.get("/api/v1/billing/store/?type=download").json()
            assert [i["title"] for i in store] == ["Premium Guide"]
        # A student cannot fetch its file either, however she got the id.
        assert make_client(student).get(f"/api/v1/downloads/{draft.pk}/url/").status_code == 404
        # Checkout refuses it.
        bought = make_client(student).post("/api/v1/billing/payments/initialize/", data=buy, format="json")
        assert bought.status_code == 400 and "not on sale" in bought.json()["detail"], bought.content
        # The coach still sees her draft, in the list and in her products.
        titles = {r["title"] for r in make_client(owner).get("/api/v1/downloads/").json()["results"]}
        assert titles == {"Premium Guide", "Draft Guide"}
        products = {i["title"]: i["is_active"] for i in make_client(owner).get("/api/v1/billing/products/").json()}
        assert products == {"Premium Guide": True, "Draft Guide": False}  # her list tells the draft apart
        # Publishing puts it on sale.
        resp = make_client(owner).patch(f"/api/v1/downloads/{draft.pk}/", {"is_published": True}, format="json")
        assert resp.status_code == 200 and resp.json()["is_published"] is True, resp.content
        store = make_client(student).get("/api/v1/billing/store/?type=download").json()
        assert {i["title"] for i in store} == {"Premium Guide", "Draft Guide"}
        bought = make_client(student).post("/api/v1/billing/payments/initialize/", data=buy, format="json")
        assert bought.status_code == 201, bought.content

    def test_a_kept_draft_is_published_from_its_page_only_with_its_file(self, owner):
        # The page's Publish keeps the finish's rule (focus mode's download): its file first.
        draft = DownloadFile.objects.create(title="No File Yet", is_published=False)
        client, path = make_client(owner), f"/api/v1/downloads/{draft.pk}/"
        assert client.get(path).json()["not_ready"] == "Add the file first"
        resp = client.patch(path, {"is_published": True, "title": "Renamed"}, format="json")
        assert resp.status_code == 400 and resp.json() == {"is_published": ["Add the file first."]}, resp.content
        draft.refresh_from_db()
        assert (draft.is_published, draft.title) == (False, "No File Yet")  # the whole change rolled back
        DownloadFile.objects.filter(pk=draft.pk).update(file_url="downloads/guide.pdf", file_size=10)
        assert client.get(path).json()["not_ready"] == ""
        resp = client.patch(path, {"is_published": True}, format="json")
        assert resp.status_code == 200 and resp.json()["is_published"] is True, resp.content

    def test_a_download_with_no_file_is_not_in_the_store(self, owner, student):
        DownloadFile.objects.create(title="No File", pricing_type="paid", price=Decimal("5.00"))
        assert make_client(student).get("/api/v1/billing/store/?type=download").json() == []
        assert [i["title"] for i in make_client(owner).get("/api/v1/billing/products/").json()] == ["No File"]

    def test_existing_downloads_stay_published(self, free_download, paid_download):
        # The migration adds the flag as published: nothing she has today goes dark.
        assert free_download.is_published is True and paid_download.is_published is True
        field = DownloadFile._meta.get_field("is_published")
        assert field.default is True
        assert DownloadFile.objects.filter(is_published=False).count() == 0

    def test_description_and_cover_photo_are_in_the_api(self, owner):
        from apps.media.models import Photo

        photo = Photo.objects.create(s3_key="photos/cover.jpg", title="Cover")
        payload = {"title": "Workbook", "description": "Twelve pages.", "thumbnail": photo.pk}
        with patch("apps.downloads.serializers.generate_presigned_download_url", return_value="https://x/cover"):
            created = make_client(owner).post("/api/v1/downloads/", data=payload, format="json")
        assert created.status_code == 201, created.content
        body = created.json()
        assert (body["description"], body["thumbnail_id"], body["is_published"]) == (
            "Twelve pages.",
            str(photo.pk),
            True,
        )
        assert body["thumbnail_signed_url"] == "https://x/cover"
