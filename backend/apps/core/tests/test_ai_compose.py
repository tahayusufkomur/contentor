import pytest
from django.db import IntegrityError

from apps.core.models import OnboardingAiUsage

pytestmark = pytest.mark.django_db


def test_usage_row_unique_per_tenant_month():
    OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")
    with pytest.raises(IntegrityError):
        OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")


def test_usage_defaults():
    row = OnboardingAiUsage.objects.create(tenant_schema="glow2", month="2026-07")
    assert row.composes_used == 0
    assert float(row.usd_spent) == 0.0
