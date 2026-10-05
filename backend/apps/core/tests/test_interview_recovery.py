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


def test_warned_coach_who_came_back_is_not_deleted(restore_public):
    """Review finding 1: a warning is not a death sentence once they return."""
    t = _tenant("iv-back", last_hours=1, created_days=30)
    Tenant.objects.filter(pk=t.pk).update(abandon_warned_at=timezone.now() - timedelta(days=10))
    _, to_delete = recovery.find_abandoned_tenants()
    assert "iv-back" not in [x.slug for x in to_delete]


def test_paying_coach_is_never_reclaimed(restore_public):
    from unittest import mock

    t = _tenant("iv-paid", last_hours=24 * 30, created_days=40)
    Tenant.objects.filter(pk=t.pk).update(abandon_warned_at=timezone.now() - timedelta(days=10))
    with mock.patch.object(Tenant, "has_paid_platform_plan", new_callable=mock.PropertyMock, return_value=True):
        to_warn, to_delete = recovery.find_abandoned_tenants()
    assert "iv-paid" not in [x.slug for x in to_warn + to_delete]


@pytest.mark.django_db
def test_setup_activity_keeps_the_tenant_alive(tenant_ctx):
    from apps.tenant_config import interview_brief

    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "interview_last_at": "2020-01-01T00:00:00+00:00"}
    )
    tenant_ctx.refresh_from_db()
    interview_brief.touch(tenant_ctx)
    stamp = Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["interview_last_at"]
    assert stamp > "2026-01-01"
