"""The compose brief must include the coach's real, published course — the
content-first flow creates the first course published, so a draft-only gather
would build the site around nothing. And compose-at-reveal must always reach
'ready', even with no AI, so a coach is never stranded on the reveal screen."""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.tasks import _gather_content_items, provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


def _tenant(schema):
    connection.set_schema_to_public()
    slug = schema.replace("_", "-")
    t = Tenant.objects.create(
        schema_name=schema,
        name=slug,
        slug=slug,
        subdomain=slug,
        owner_email=f"{slug}@example.com",
        region="global",
    )
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    connection.set_schema_to_public()
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_gather_includes_published_courses(restore_public):
    t = _tenant("reveal_pub")
    try:
        with tenant_context(t):
            from apps.accounts.models import User
            from apps.courses.models import Course

            owner = User.objects.filter(role="owner").first()
            Course.objects.create(title="Real Course", instructor=owner, is_published=True)
            course_items, _downloads = _gather_content_items(t)
        titles = [c["title"] for c in course_items]
        assert "Real Course" in titles
    finally:
        _drop("reveal_pub")


def test_gather_still_includes_draft_courses(restore_public):
    """Classic tenants only ever have draft demo courses here — widening the
    filter must not drop them."""
    t = _tenant("reveal_draft")
    try:
        with tenant_context(t):
            from apps.accounts.models import User
            from apps.courses.models import Course

            owner = User.objects.filter(role="owner").first()
            Course.objects.create(title="Draft Course", instructor=owner, is_published=False)
            course_items, _downloads = _gather_content_items(t)
        assert "Draft Course" in [c["title"] for c in course_items]
    finally:
        _drop("reveal_draft")


# ── compose-at-reveal ────────────────────────────────────────────────────────


def test_compose_wizard_site_reaches_ready_even_if_ai_unavailable(restore_public):
    from unittest import mock

    from apps.core import tasks

    t = _tenant("reveal_ready")
    try:
        # AI off -> deterministic pages; must still reach ready, never 'failed'.
        with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
            tasks.compose_wizard_site.apply(args=(t.id,))
        connection.set_schema_to_public()
        t.refresh_from_db()
        assert t.provisioning_status == "ready"
    finally:
        _drop("reveal_ready")


def test_compose_wizard_site_ignores_a_tenant_without_a_schema(restore_public):
    """A 'pending' tenant has no schema — composing it would explode. The task
    must no-op rather than mark it failed."""
    from apps.core import tasks

    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name="reveal_pending",
        name="reveal-pending",
        slug="reveal-pending",
        subdomain="reveal-pending",
        owner_email="reveal-pending@example.com",
        region="global",
    )
    try:
        tasks.compose_wizard_site.apply(args=(t.id,))
        t.refresh_from_db()
        assert t.provisioning_status == "pending"  # untouched, not 'failed'
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(pk=t.pk).delete()


def test_compose_wizard_site_is_idempotent_once_ready(restore_public):
    from unittest import mock

    from apps.core import tasks

    t = _tenant("reveal_twice")
    try:
        with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
            tasks.compose_wizard_site.apply(args=(t.id,))
            # Second run must return early rather than recompose.
            with mock.patch("apps.core.tasks._apply_wizard_answers") as apply_again:
                tasks.compose_wizard_site.apply(args=(t.id,))
                apply_again.assert_not_called()
        connection.set_schema_to_public()
        t.refresh_from_db()
        assert t.provisioning_status == "ready"
    finally:
        _drop("reveal_twice")


def test_compose_endpoint_enqueues_only_for_a_provisioned_tenant(restore_public):
    from unittest import mock

    from rest_framework.test import APIClient

    from apps.accounts.tokens import create_wizard_token

    t = _tenant("reveal_ep")
    api = APIClient()
    token = create_wizard_token(t.owner_email, t.name, t.slug, region=t.region or "global")
    try:
        with mock.patch("apps.core.tasks.compose_wizard_site.delay") as delay:
            resp = api.post("/api/v1/onboarding/wizard/compose/", {"token": token}, format="json")
        assert resp.status_code == 200, resp.content
        assert resp.json()["status"] == "provisioned"
        delay.assert_called_once_with(t.id)

        # Once ready, hitting it again must not re-enqueue.
        Tenant.objects.filter(pk=t.pk).update(provisioning_status="ready")
        with mock.patch("apps.core.tasks.compose_wizard_site.delay") as delay2:
            resp = api.post("/api/v1/onboarding/wizard/compose/", {"token": token}, format="json")
        assert resp.status_code == 200
        delay2.assert_not_called()
    finally:
        _drop("reveal_ep")
