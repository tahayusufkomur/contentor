"""The compose brief must include the coach's courses, published or draft."""

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
