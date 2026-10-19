"""The public menu hides links to pages with nothing behind them (audit
2026-10-09: a Courses link and an "Explore our courses" button with no
courses, an Events link after the class was skipped)."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.live.models import LiveClass

pytestmark = pytest.mark.django_db
URL = "/api/v1/site/menu/"


def test_menu_says_which_pages_have_something_behind_them(tenant_ctx):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    assert client.get(URL).json() == {"courses": False, "events": False}

    owner = User.objects.create_user(email="o@menu.test", name="O", password="x", role="owner")  # noqa: S106
    Course.objects.create(title="Draft", instructor=owner, is_published=False)
    LiveClass.objects.create(title="Past", instructor=owner, scheduled_at=timezone.now() - timedelta(days=3))
    assert client.get(URL).json() == {"courses": False, "events": False}  # a draft, a class long over

    LiveClass.objects.create(  # held until she publishes it: the public calendar hides it, so the menu does too
        title="Held", instructor=owner, scheduled_at=timezone.now() + timedelta(days=2), status="draft"
    )
    assert client.get(URL).json() == {"courses": False, "events": False}

    Course.objects.create(title="Desk yoga", instructor=owner, is_published=True)
    LiveClass.objects.create(
        title="Tuesday", instructor=owner, scheduled_at=timezone.now() + timedelta(days=2), status="scheduled"
    )
    assert client.get(URL).json() == {"courses": True, "events": True}
