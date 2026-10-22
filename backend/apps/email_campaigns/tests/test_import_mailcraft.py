"""The one-off copy of MailCraft templates into Contentor's own (import_mailcraft_templates)."""

from unittest import mock

import pytest
from django.core.management import call_command

from apps.email_campaigns.models import EmailTemplate, TemplateSource
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

DESIGN = {
    "version": 1,
    "settings": {},
    "header": {"blocks": []},
    "body": {"blocks": [{"id": "t", "type": "text", "data": {"html": "<p>Hi<script>x()</script></p>"}, "style": {}}]},
    "footer": {"blocks": []},
}


def _mailcraft(url, headers, params, timeout):
    response = mock.Mock(status_code=200)
    response.raise_for_status = lambda: None
    if url.endswith("/api/v1/templates/"):
        response.json = lambda: {"results": [{"id": i} for i in "abcd"], "next": None}
    else:
        row = {
            "a": {"name": "Spring news", "template_type": "user", "json_data": DESIGN},
            "b": {"name": "Big sale", "json_data": DESIGN},
            # MailCraft's stock gallery copy, and an empty one she never filled.
            "c": {"name": "Devil's Garage — Flame sale", "template_type": "provided", "json_data": DESIGN},
            "d": {"name": "Untitled Email", "template_type": "user", "json_data": {**DESIGN, "body": {"blocks": []}}},
        }[url.rstrip("/").rsplit("/", 1)[-1]]
        response.json = lambda: {"category": "promotional", **row}
    return response


def test_her_mailcraft_templates_are_copied_once_and_cleaned(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.emailcraft_api_key = "mc_live_key"  # noqa: S105  # pragma: allowlist secret
    cfg.save()
    with mock.patch(
        "apps.email_campaigns.management.commands.import_mailcraft_templates.requests.get", side_effect=_mailcraft
    ):
        call_command("import_mailcraft_templates")
        call_command("import_mailcraft_templates")
    imported = EmailTemplate.objects.filter(source=TemplateSource.IMPORTED).order_by("name")
    assert [(t.name, t.category) for t in imported] == [("Big sale", "offer"), ("Spring news", "offer")]
    assert "script" not in imported[0].design["body"]["blocks"][0]["data"]["html"]
