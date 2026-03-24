"""
Unit tests for Course model slug generation.

Tests the auto-slug logic in Course.save():
  - auto-generates slug from title
  - preserves manually-set slugs
  - handles duplicates with numeric suffixes
  - truncates long slugs to 200 chars

Uses shared tenant fixtures from conftest.py.
"""

import pytest

from apps.accounts.models import User
from apps.courses.models import Course

# ---------------------------------------------------------------------------
# Helper: instructor user
# ---------------------------------------------------------------------------


@pytest.fixture()
def instructor(tenant_ctx):
    return User.objects.create_user(
        email="instructor@coursemodeltest.com",
        name="Instructor",
        password="secret123",
        role="owner",
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCourseSlugGeneration:
    def test_auto_generates_slug_from_title(self, instructor):
        """Course without explicit slug gets one derived from its title."""
        course = Course.objects.create(title="My Course", instructor=instructor)
        assert course.slug == "my-course"

    def test_preserves_existing_slug(self, instructor):
        """When a slug is explicitly provided, it is kept as-is."""
        course = Course.objects.create(title="X", slug="custom-slug", instructor=instructor)
        assert course.slug == "custom-slug"

    def test_handles_duplicate_slugs(self, instructor):
        """Second course with the same title gets a '-1' suffix."""
        Course.objects.create(title="Duplicate Title", instructor=instructor)
        second = Course.objects.create(title="Duplicate Title", instructor=instructor)
        assert second.slug == "duplicate-title-1"

    def test_handles_multiple_duplicates(self, instructor):
        """Third course with the same title gets '-2'."""
        first = Course.objects.create(title="Same Title", instructor=instructor)
        second = Course.objects.create(title="Same Title", instructor=instructor)
        third = Course.objects.create(title="Same Title", instructor=instructor)
        assert first.slug == "same-title"
        assert second.slug == "same-title-1"
        assert third.slug == "same-title-2"

    def test_slug_not_changed_on_update(self, instructor):
        """Once a slug is set, updating the title does not alter the slug."""
        course = Course.objects.create(title="Original Title", instructor=instructor)
        original_slug = course.slug
        course.title = "New Title"
        course.save()
        course.refresh_from_db()
        assert course.slug == original_slug

    def test_handles_special_characters(self, instructor):
        """Special characters in the title are properly slugified."""
        course = Course.objects.create(title="Hello World! @#$% & More", instructor=instructor)
        assert course.slug == "hello-world-more"

    def test_truncates_long_slugs(self, instructor):
        """Slugs derived from titles at the max length are truncated to 200 characters."""
        # Title field is max_length=200, so use exactly 200 chars.
        # slugify keeps it the same length for simple ascii.
        long_title = "a" * 200
        course = Course.objects.create(title=long_title, instructor=instructor)
        assert len(course.slug) <= 200
