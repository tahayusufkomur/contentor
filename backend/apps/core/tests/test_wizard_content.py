"""Wizard content endpoints write real rows into the tenant schema under
wizard-token auth (no coach JWT exists yet). Real-schema harness: provision the
tenant with Plan 3a's schema step, assert inside tenant_context, drop in
finally."""

from datetime import timedelta
from unittest import mock

import pytest
from django.db import connection
from django.utils import timezone
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def client():
    return APIClient()


def _tenant_row(schema):
    """Public-schema row only. slug == subdomain == the hyphenated schema so
    slugify(brand_name) in _resolve_tenant_from_wizard_token resolves back."""
    connection.set_schema_to_public()
    slug = schema.replace("_", "-")
    return Tenant.objects.create(
        schema_name=schema,
        name=slug,
        slug=slug,
        subdomain=slug,
        owner_email=f"{slug}@example.com",
        region="global",
    )


def _provisioned_tenant(schema):
    t = _tenant_row(schema)
    provision_tenant_schema(t, t.owner_email, "Owner", "en")  # status -> provisioned
    connection.set_schema_to_public()
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def _token(t):
    return create_wizard_token(t.owner_email, t.name, t.slug, region=t.region or "global")


def test_course_outlines_returns_options(client, restore_public):
    t = _provisioned_tenant("wc_outlines")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course-outlines/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        outlines = resp.json()["outlines"]
        assert 1 <= len(outlines) <= 3
        assert "title" in outlines[0]
        assert "description" in outlines[0]
        assert "suggested_price" in outlines[0]
    finally:
        _drop("wc_outlines")


def test_content_endpoint_rejects_unprovisioned_tenant(client, restore_public):
    t = _tenant_row("wc_pending")  # still 'pending', no schema
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course-outlines/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 409
        assert resp.json()["detail"] == "provisioning"
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(pk=t.pk).delete()


def test_course_outlines_uses_the_model_when_ai_is_available(client, restore_public):
    """The AI branch: without this the suite only ever exercises the fallback
    (the test env has no provider configured)."""
    from apps.core.onboarding.course_outlines import _Outline, _Outlines

    parsed = _Outlines(
        outlines=[
            _Outline(title="Sourdough in 7 Days", description="Bake your first loaf.", suggested_price=39),
            _Outline(title="Crumb Mastery", description="Open crumb, every time.", suggested_price=89),
        ]
    )
    t = _provisioned_tenant("wc_ai")
    try:
        with (
            mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
            mock.patch("apps.core.ai.structured", return_value=(parsed, 0.02, "m")) as structured,
            mock.patch("apps.core.onboarding.ai_compose.record_spend") as record_spend,
        ):
            resp = client.post(
                "/api/v1/onboarding/wizard/content/course-outlines/",
                {"token": _token(t)},
                format="json",
            )
        assert resp.status_code == 200, resp.content
        assert [o["title"] for o in resp.json()["outlines"]] == ["Sourdough in 7 Days", "Crumb Mastery"]
        structured.assert_called_once()
        record_spend.assert_called_once_with(t.schema_name, 0.02)
    finally:
        _drop("wc_ai")


def test_course_outlines_falls_back_when_the_model_errors(client, restore_public):
    from apps.core.ai import AiError

    t = _provisioned_tenant("wc_aifail")
    try:
        with (
            mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
            mock.patch("apps.core.ai.structured", side_effect=AiError("boom", cost_usd=0.01)),
            mock.patch("apps.core.onboarding.ai_compose.record_spend") as record_spend,
        ):
            resp = client.post(
                "/api/v1/onboarding/wizard/content/course-outlines/",
                {"token": _token(t)},
                format="json",
            )
        assert resp.status_code == 200, resp.content  # fail-soft, never a 500
        assert len(resp.json()["outlines"]) == 3
        record_spend.assert_called_once_with(t.schema_name, 0.01)  # billed attempt still accrues
    finally:
        _drop("wc_aifail")


def test_content_endpoint_rejects_a_bad_token(client, restore_public):
    resp = client.post(
        "/api/v1/onboarding/wizard/content/course-outlines/",
        {"token": "not-a-token"},
        format="json",
    )
    assert resp.status_code == 400


def test_create_course_writes_a_published_owned_course(client, restore_public):
    t = _provisioned_tenant("wc_course")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course/",
            {"token": _token(t), "title": "My First Course", "price": 49, "pricing_type": "paid"},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.courses.models import Course

            course = Course.objects.get(pk=resp.json()["id"])
            assert course.title == "My First Course"
            assert course.is_published is True  # the publish gate counts published courses only
            assert course.instructor.role == "owner"
            assert course.slug == resp.json()["slug"]
    finally:
        _drop("wc_course")


def test_created_course_counts_as_the_coachs_own_content(client, restore_public):
    """The publish gate's _has_own ignores rows registered as seeded. Content
    the coach makes in the wizard must NOT be registered, or finishing signup
    would leave them unable to publish."""
    t = _provisioned_tenant("wc_own")
    try:
        client.post(
            "/api/v1/onboarding/wizard/content/course/",
            {"token": _token(t), "title": "Owned Course"},
            format="json",
        )
        with tenant_context(t):
            from apps.courses.models import Course
            from apps.tenant_config.setup_items import _has_own

            assert _has_own(Course, [], queryset=Course.objects.filter(is_published=True)) is True
    finally:
        _drop("wc_own")


def test_create_live_event(client, restore_public):
    t = _provisioned_tenant("wc_event")
    try:
        when = (timezone.now() + timedelta(days=7)).isoformat()
        resp = client.post(
            "/api/v1/onboarding/wizard/content/event/",
            {"token": _token(t), "kind": "live", "title": "Kickoff Class", "scheduled_at": when},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.live.models import LiveClass

            event = LiveClass.objects.get(pk=resp.json()["id"])
            assert event.title == "Kickoff Class"
            assert event.instructor.role == "owner"
            # _ScheduledOnCreateMixin: a dated event must not stay an invisible draft.
            assert event.status == "scheduled"
    finally:
        _drop("wc_event")


def test_create_onsite_event(client, restore_public):
    """The onsite branch takes a different serializer but the same owner FK —
    apps/live/views.py's onsite_event_list_create also saves instructor=user."""
    t = _provisioned_tenant("wc_onsite")
    try:
        when = (timezone.now() + timedelta(days=10)).isoformat()
        resp = client.post(
            "/api/v1/onboarding/wizard/content/event/",
            {
                "token": _token(t),
                "kind": "onsite",
                "title": "Studio Open Day",
                "location": "Kadıköy Studio",
                "scheduled_at": when,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.live.models import OnsiteEvent

            event = OnsiteEvent.objects.get(pk=resp.json()["id"])
            assert event.location == "Kadıköy Studio"
            assert event.instructor.role == "owner"
            assert event.status == "scheduled"
    finally:
        _drop("wc_onsite")


def test_create_event_requires_title(client, restore_public):
    t = _provisioned_tenant("wc_noevent")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/event/",
            {"token": _token(t), "kind": "live"},
            format="json",
        )
        assert resp.status_code == 400
    finally:
        _drop("wc_noevent")


def test_create_blog_post_published(client, restore_public):
    t = _provisioned_tenant("wc_blog")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/blog/",
            {"token": _token(t), "title": "Welcome", "body_html": "<p>Hi</p>", "status": "published"},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.blog.models import BlogPost

            post = BlogPost.objects.get(pk=resp.json()["id"])
            assert post.status == "published"
            assert post.published_at is not None
            assert post.slug == resp.json()["slug"]
            assert post.created_by.role == "owner"
            assert post.source == "manual"
    finally:
        _drop("wc_blog")


def test_create_blog_post_defaults_to_draft(client, restore_public):
    t = _provisioned_tenant("wc_blogdraft")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/blog/",
            {"token": _token(t), "title": "Later", "body_html": "<p>Soon</p>"},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        with tenant_context(t):
            from apps.blog.models import BlogPost

            post = BlogPost.objects.get(pk=resp.json()["id"])
            assert post.status == "draft"
            assert post.published_at is None
    finally:
        _drop("wc_blogdraft")


def test_create_course_requires_title(client, restore_public):
    t = _provisioned_tenant("wc_notitle")
    try:
        resp = client.post(
            "/api/v1/onboarding/wizard/content/course/",
            {"token": _token(t)},
            format="json",
        )
        assert resp.status_code == 400
    finally:
        _drop("wc_notitle")
