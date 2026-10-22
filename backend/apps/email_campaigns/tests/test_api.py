"""The coach's email API: templates (her starters first), drafts, the preview, a test to herself, and
starting the Designer."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import DevOutboundEmail
from apps.email_campaigns import designer
from apps.email_campaigns.models import CampaignStatus, EmailCampaign, EmailDesignJob, EmailTemplate, TemplateSource
from apps.email_campaigns.starters import blank_design, compose
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name = "Glow"
    cfg.save()
    return User.objects.create_user(
        email="owner@glow.test",
        name="Mara Lind",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


def _client(user):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    return client


def test_her_templates_list_starts_with_the_ones_made_for_her(owner):
    EmailTemplate.objects.create(name="Mine", design=blank_design(), source=TemplateSource.COACH)
    r = _client(owner).get("/api/v1/email/templates/")
    assert r.status_code == 200, r.content
    rows = r.json()["results"]
    assert rows[0]["source"] == TemplateSource.STARTER and rows[-1]["name"] == "Mine"
    assert all(row["preview_html"].startswith("<!DOCTYPE html>") for row in rows)
    assert "design" not in rows[0]


def test_a_student_cannot_touch_her_emails(owner):
    student = User.objects.create_user(email="s@glow.test", name="S", password="x" * 10, role="student")
    assert _client(student).get("/api/v1/email/templates/").status_code == 403
    assert _client(student).post("/api/v1/email/campaigns/", {}, format="json").status_code == 403


def test_a_draft_starts_from_a_template_and_keeps_its_own_copy(owner):
    template = EmailTemplate.objects.create(
        name="News", subject="News from Glow", design=compose(None, heading="Old"), source=TemplateSource.COACH
    )
    client = _client(owner)
    r = client.post("/api/v1/email/campaigns/", {"template_id": template.pk}, format="json")
    assert r.status_code == 201, r.content
    draft = r.json()
    assert (draft["status"], draft["subject"], draft["template"]) == ("draft", "News from Glow", template.pk)

    design = compose(None, heading="New words")
    r = client.patch(f"/api/v1/email/campaigns/{draft['id']}/", {"design": design, "preheader": "Hi"}, format="json")
    assert r.status_code == 200, r.content
    template.refresh_from_db()
    assert "Old" in repr(template.design) and "New words" in repr(EmailCampaign.objects.get().design)

    blank = client.post("/api/v1/email/campaigns/", {}, format="json").json()
    assert blank["design"]["header"]["blocks"][0]["type"] == "brandHeader"


def test_what_is_stored_is_cleaned(owner):
    draft = EmailCampaign.objects.create(status=CampaignStatus.DRAFT, design=blank_design(), sender=owner)
    evil = blank_design()
    evil["body"]["blocks"] = [
        {"id": "t", "type": "text", "data": {"html": "<p>Hi<script>x()</script></p>"}, "style": {}}
    ]
    _client(owner).patch(f"/api/v1/email/campaigns/{draft.pk}/", {"design": evil}, format="json")
    draft.refresh_from_db()
    assert "script" not in draft.design["body"]["blocks"][0]["data"]["html"]
    bad = _client(owner).patch(f"/api/v1/email/campaigns/{draft.pk}/", {"design": "nope"}, format="json")
    assert bad.status_code == 400


def test_a_sent_email_cannot_change(owner):
    sent = EmailCampaign.objects.create(subject="Done", status=CampaignStatus.SENT, sender=owner)
    client = _client(owner)
    assert client.patch(f"/api/v1/email/campaigns/{sent.pk}/", {"subject": "x"}, format="json").status_code == 400
    assert client.delete(f"/api/v1/email/campaigns/{sent.pk}/").status_code == 400


def test_editing_a_scheduled_email_takes_it_back_to_a_draft(owner):
    from django.utils import timezone

    scheduled = EmailCampaign.objects.create(
        subject="Soon", status=CampaignStatus.SCHEDULED, scheduled_at=timezone.now(), sender=owner
    )
    _client(owner).patch(f"/api/v1/email/campaigns/{scheduled.pk}/", {"subject": "Later"}, format="json")
    scheduled.refresh_from_db()
    assert (scheduled.status, scheduled.scheduled_at, scheduled.subject) == (CampaignStatus.DRAFT, None, "Later")


def test_the_preview_is_the_email_an_inbox_gets(owner):
    design = compose(None, heading="Spring", body_html="<p>Hi {{FirstName}}</p>")
    r = _client(owner).post(
        "/api/v1/email/render/", {"design": design, "subject": "S", "preheader": "P"}, format="json"
    )
    assert r.status_code == 200, r.content
    body = r.json()
    assert "Spring" in body["html"] and "Hi Alex" in body["html"] and "brand:" not in body["html"]
    assert "Spring" in body["text"] and body["warnings"] == []


def test_a_test_goes_to_her_own_inbox(owner, settings):
    settings.EMAIL_SINK_ENABLED = True
    draft = EmailCampaign.objects.create(
        status=CampaignStatus.DRAFT,
        subject="Spring, {{FirstName}}",
        design=compose(None, heading="Spring"),
        sender=owner,
    )
    r = _client(owner).post(f"/api/v1/email/campaigns/{draft.pk}/test/")
    assert r.status_code == 200, r.content
    mail = DevOutboundEmail.objects.filter(to="owner@glow.test").latest("pk")
    assert mail.subject == "[Test] Spring, Mara" and "Spring" in mail.html and "Unsubscribe" in mail.html
    draft.refresh_from_db()
    assert draft.status == CampaignStatus.DRAFT  # a test changes nothing


def test_save_as_template_and_duplicate(owner):
    draft = EmailCampaign.objects.create(status=CampaignStatus.DRAFT, subject="Spring", design=blank_design())
    client = _client(owner)
    made = client.post(f"/api/v1/email/campaigns/{draft.pk}/save-as-template/", {"name": "Spring style"}, format="json")
    assert made.status_code == 201 and made.json()["name"] == "Spring style"
    copy_ = client.post(f"/api/v1/email/templates/{made.json()['id']}/duplicate/")
    assert copy_.status_code == 201 and copy_.json()["name"] == "Spring style (copy)"


def test_the_designer_starts_a_run_on_a_draft(owner):
    draft = EmailCampaign.objects.create(status=CampaignStatus.DRAFT, design=blank_design(), sender=owner)
    client = _client(owner)
    with (
        mock.patch.object(designer, "available", return_value=(True, "ok")),
        mock.patch("apps.email_campaigns.tasks.run_design_job.delay") as delay,
    ):
        r = client.post(
            "/api/v1/email/designer/",
            {"brief": "Announce my new class", "campaign_id": draft.pk, "refs": ["next:event"]},
            format="json",
        )
    assert r.status_code == 202, r.content
    job = EmailDesignJob.objects.get()
    assert "Announce my new class" in job.brief and "next:event" in job.brief
    delay.assert_called_once()
    status = client.get(f"/api/v1/email/designer/{job.pk}/").json()
    assert status["status"] == "queued" and status["campaign"] == draft.pk

    with mock.patch.object(designer, "available", return_value=(False, "budget")):
        assert (
            client.post("/api/v1/email/designer/", {"brief": "x", "campaign_id": draft.pk}, format="json").status_code
            == 503
        )
    both = client.post("/api/v1/email/designer/", {"brief": "x"}, format="json")
    assert both.status_code == 400


def test_the_live_count_leaves_out_students_who_unsubscribed(owner):
    from apps.notifications.models import EmailOptOut

    for email in ("a@glow.test", "b@glow.test"):
        User.objects.create_user(email=email, name=email[0], password="x" * 10, role="student")
    EmailOptOut.objects.create(email="b@glow.test")
    client = _client(owner)
    r = client.post("/api/v1/email/recipients/count/", {"recipient_filter": {"type": "all"}}, format="json")
    assert r.json() == {"count": 1}
    bad = client.post("/api/v1/email/recipients/count/", {"recipient_filter": {"type": "nope"}}, format="json")
    assert bad.status_code == 400
