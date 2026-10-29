"""An error is worded in the reader's language (Task 4.3b): a creator reads it in theirs."""

import pytest

from apps.accounts.models import User
from apps.core.tests.i18n_utils import creator_client, translated

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang-b.com", name="Owner", password="x", role="owner")
    student = User.objects.create_user(email="student@errorlang-b.com", name="S", password="x", role="student")
    client = creator_client(tenant_ctx, owner)

    # accounts: student_grant_access once had a throwaway `_` that would shadow gettext
    grant = client.post(
        f"/api/v1/auth/students/{student.pk}/grant-access/", {}, content_type="application/json", HTTP_HOST=HOST
    )
    assert grant.status_code == 400
    assert grant.json()["detail"] == translated("course_id is required.")

    gone = client.delete("/api/v1/auth/students/999999/", HTTP_HOST=HOST)
    assert gone.status_code == 404
    assert gone.json()["detail"] == translated("Student not found.")

    # billing: the machine code stays, the sentence follows the creator
    dashboard = client.get("/api/v1/billing/connect/dashboard/", HTTP_HOST=HOST)
    assert dashboard.status_code == 400
    assert dashboard.json() == {"error": "NOT_CONNECTED", "detail": translated("No connected account yet.")}


def test_access_and_stripe_failures_follow_the_creator_language(tenant_ctx):
    from unittest import mock

    from apps.billing.providers.types import ProviderError

    owner = User.objects.create_user(email="owner2@errorlang-b.com", name="Owner", password="x", role="owner")
    client = creator_client(tenant_ctx, owner)

    # a WaysError sentence, shown by the Access section
    gone = client.get("/api/v1/admin/access/course/999999/", HTTP_HOST=HOST)
    assert gone.status_code == 404
    assert gone.json() == {"code": "not_found", "detail": translated("I could not find that item.")}

    # a provider failure never shows Stripe's own text
    tenant_ctx.stripe_account_id = "acct_x"
    tenant_ctx.save(update_fields=["stripe_account_id"])
    try:
        with mock.patch(
            "apps.billing.views.connect.connect.create_dashboard_link",
            side_effect=ProviderError("raw Stripe text", code="STRIPE_ERROR"),
        ):
            failed = client.get("/api/v1/billing/connect/dashboard/", HTTP_HOST=HOST)
    finally:
        tenant_ctx.stripe_account_id = ""
        tenant_ctx.save(update_fields=["stripe_account_id"])
    assert failed.status_code == 400
    assert failed.json() == {
        "error": "STRIPE_ERROR",
        "detail": translated("Payment could not be processed. Please try again."),
    }


def test_studio_toast_counts_take_plural_forms():
    from django.utils.translation import ngettext, override

    def toast(language, count):
        with override(language):
            return ngettext("Deactivated %(count)d plan.", "Deactivated %(count)d plans.", count) % {"count": count}

    assert toast("en", 1) == "Deactivated 1 plan."
    assert toast("en", 3) == "Deactivated 3 plans."
    assert toast("pl", 3) != "Deactivated 3 plans."
