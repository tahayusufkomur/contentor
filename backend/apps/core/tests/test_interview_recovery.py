"""Coaches who stall mid-interview get the nudge, then the cleanup."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.models import Tenant
from apps.core.onboarding import recovery

pytestmark = pytest.mark.django_db


def _tenant(slug, *, last_hours, published=False, created_days=2):
    now = timezone.now()
    t = Tenant(
        schema_name=slug.replace("-", "_"),
        name=slug,
        slug=slug,
        subdomain=slug,
        owner_email=f"{slug}@t.dev",
        provisioning_status="ready",
        is_published=published,
    )
    t.wizard_state = {"flow": "interview", "interview_last_at": (now - timedelta(hours=last_hours)).isoformat()}
    t.auto_create_schema = False
    t.save()
    Tenant.objects.filter(pk=t.pk).update(created_at=now - timedelta(days=created_days))
    return Tenant.objects.get(pk=t.pk)


def test_idle_interview_tenant_is_a_recovery_candidate(restore_public):
    idle = _tenant("iv-idle", last_hours=30)
    _tenant("iv-busy", last_hours=1)
    _tenant("iv-live", last_hours=30, published=True)
    assert [t.slug for t in recovery.recovery_candidates()] == [idle.slug]


def test_abandoned_interview_tenant_is_warned(restore_public):
    stale = _tenant("iv-stale", last_hours=24 * 20, created_days=21)
    to_warn, _ = recovery.find_abandoned_tenants()
    assert stale.slug in [t.slug for t in to_warn]
