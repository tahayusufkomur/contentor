from datetime import date

import pytest
from django.db import transaction
from django.db.utils import IntegrityError

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)


def test_usage_event_dedupes_per_day(tenant_ctx):
    user = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    kwargs = {"user": user, "mode": "pwa", "platform": "ios", "day": date(2026, 6, 20)}
    UsageEvent.objects.create(**kwargs)
    with pytest.raises(IntegrityError), transaction.atomic():
        UsageEvent.objects.create(**kwargs)


def test_user_usage_fields_default_empty(tenant_ctx):
    user = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    assert user.last_display_mode == ""
    assert user.last_platform == ""
    assert user.first_pwa_at is None
