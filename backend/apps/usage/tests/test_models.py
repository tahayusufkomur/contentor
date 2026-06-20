from datetime import date

import pytest
from django.db import connection, transaction
from django.db.utils import IntegrityError
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)


def test_usage_event_dedupes_per_day(tenant_ctx):
    # UsageEvent lives in the public schema; user FK must also resolve there.
    # Briefly switch to public to create the user, then restore tenant context.
    tenant = tenant_ctx  # tenant_ctx yields the tenant object
    connection.set_schema_to_public()
    user = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    # Restore tenant context so teardown cleanup runs in the right schema.
    connection.set_tenant(tenant)

    kwargs = dict(user=user, tenant=tenant, mode="pwa", platform="ios", day=date(2026, 6, 20))
    # UsageEvent writes to the public schema regardless of active tenant context.
    connection.set_schema_to_public()
    UsageEvent.objects.create(**kwargs)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            UsageEvent.objects.create(**kwargs)
    # Restore tenant context for teardown.
    connection.set_tenant(tenant)


def test_user_usage_fields_default_empty(tenant_ctx):
    user = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    assert user.last_display_mode == ""
    assert user.last_platform == ""
    assert user.first_pwa_at is None
