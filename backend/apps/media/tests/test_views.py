"""
Media / Photo views API tests.

Tests for:
  - GET/POST /api/v1/photos/              (photo_list_create)
  - GET/PUT/DELETE /api/v1/photos/<uuid>/  (photo_detail)

Uses shared tenant fixtures from conftest.py.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.media.models import Photo

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@mediatest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@mediatest.com", name="Student", password="secret123", role="student")


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def photo(tenant_ctx):
    return Photo.objects.create(
        s3_key="photos/sample-photo.jpg",
        alt_text="A sample photo",
        title="Sample Photo",
        content_type="image/jpeg",
        file_size=4096,
        width=1920,
        height=1080,
    )


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests: photo_list_create
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestPhotoListCreate:
    def test_owner_lists_photos_with_pagination(self, photo, owner):
        """GET by owner returns paginated list of photos."""
        client = make_client(owner)
        response = client.get("/api/v1/photos/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 1
        assert data["results"][0]["title"] == "Sample Photo"

    def test_search_filter_by_title(self, photo, owner):
        """GET ?search= filters photos by title."""
        client = make_client(owner)
        response = client.get("/api/v1/photos/?search=Sample")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["title"] == "Sample Photo"

    def test_search_no_match(self, photo, owner):
        """GET ?search= with non-matching query returns empty results."""
        client = make_client(owner)
        response = client.get("/api/v1/photos/?search=NonExistent")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data["results"]) == 0

    def test_owner_creates_photo(self, owner):
        """POST by owner creates a photo and returns 201."""
        client = make_client(owner)
        payload = {
            "s3_key": "photos/new-photo.png",
            "alt_text": "A new photo",
            "title": "New Photo",
            "content_type": "image/png",
            "file_size": 2048,
            "width": 800,
            "height": 600,
        }
        response = client.post("/api/v1/photos/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["title"] == "New Photo"
        assert data["s3_key"] == "photos/new-photo.png"

    def test_student_list_forbidden(self, photo, student):
        """GET by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.get("/api/v1/photos/")
        assert response.status_code == 403, response.content

    def test_student_create_forbidden(self, student):
        """POST by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        payload = {
            "s3_key": "photos/student-photo.png",
            "title": "Student Photo",
        }
        response = client.post("/api/v1/photos/", data=payload, format="json")
        assert response.status_code == 403, response.content


# ---------------------------------------------------------------------------
# Tests: photo_detail
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestPhotoDetail:
    def test_owner_gets_photo_detail(self, photo, owner):
        """GET by owner returns photo detail."""
        client = make_client(owner)
        response = client.get(f"/api/v1/photos/{photo.pk}/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["id"] == str(photo.pk)
        assert data["title"] == "Sample Photo"

    def test_owner_updates_photo(self, photo, owner):
        """PUT by owner updates the photo."""
        client = make_client(owner)
        payload = {
            "s3_key": photo.s3_key,
            "alt_text": "Updated alt text",
            "title": "Updated Photo",
            "content_type": photo.content_type,
            "file_size": photo.file_size,
            "width": photo.width,
            "height": photo.height,
        }
        response = client.put(f"/api/v1/photos/{photo.pk}/", data=payload, format="json")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["title"] == "Updated Photo"
        assert data["alt_text"] == "Updated alt text"

    def test_owner_deletes_photo(self, photo, owner):
        """DELETE by owner returns 204."""
        client = make_client(owner)
        response = client.delete(f"/api/v1/photos/{photo.pk}/")
        assert response.status_code == 204, response.content

    def test_student_get_forbidden(self, photo, student):
        """GET by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.get(f"/api/v1/photos/{photo.pk}/")
        assert response.status_code == 403, response.content

    def test_student_put_forbidden(self, photo, student):
        """PUT by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.put(
            f"/api/v1/photos/{photo.pk}/",
            data={"title": "Hacked"},
            format="json",
        )
        assert response.status_code == 403, response.content

    def test_student_delete_forbidden(self, photo, student):
        """DELETE by student returns 403 (IsCoachOrOwner)."""
        client = make_client(student)
        response = client.delete(f"/api/v1/photos/{photo.pk}/")
        assert response.status_code == 403, response.content

    def test_nonexistent_uuid_returns_404(self, owner):
        """GET with a non-existent UUID returns 404."""
        client = make_client(owner)
        fake_uuid = uuid.uuid4()
        response = client.get(f"/api/v1/photos/{fake_uuid}/")
        assert response.status_code == 404, response.content
