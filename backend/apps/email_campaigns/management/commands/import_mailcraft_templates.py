"""Copy every coach's (and the platform's) MailCraft templates into Contentor's own, once, when the
email engine moves in. Idempotent: a template already imported under the same name is skipped. Only
the ones she made come over: MailCraft's stock gallery copies (template_type "provided": made-up brands
like "Devil's Garage — Flame sale") and empty ones stay behind.

    manage.py import_mailcraft_templates [--dry-run]

Reads the per-org keys MailCraft provisioning stored (TenantConfig.emailcraft_api_key,
PlatformEmailConfig); those fields go once this has run on prod.
"""

import requests
from django.conf import settings
from django.core.management.base import BaseCommand
from django_tenants.utils import get_tenant_model, tenant_context

from apps.email_campaigns.brand import DesignError, blocks_of, clean_design

CATEGORIES = {"newsletter": "newsletter", "promotional": "offer", "welcome": "welcome", "event": "event"}


def _get(path, key, **params):
    response = requests.get(
        f"{settings.EMAILCRAFT_BASE_URL.rstrip('/')}{path}",
        headers={"X-API-Key": key},
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def mailcraft_templates(key):
    """(name, category, json_data) of every template she made in the org behind this key."""
    page = 1
    while True:
        data = _get("/api/v1/templates/", key, page=page)
        rows = data.get("results", data) if isinstance(data, dict) else data
        for row in rows:
            detail = _get(f"/api/v1/templates/{row['id']}/", key)
            if detail.get("template_type") == "provided":
                continue
            yield (
                str(detail.get("name") or "Imported email")[:120],
                detail.get("category") or "",
                detail.get("json_data"),
            )
        if not isinstance(data, dict) or not data.get("next"):
            return
        page += 1


class Command(BaseCommand):
    help = "Copy MailCraft templates into Contentor's own email templates (once)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **options):
        from apps.email_campaigns.models import EmailTemplate, TemplateSource
        from apps.platform_email.models import PlatformEmailConfig, PlatformEmailTemplate
        from apps.tenant_config.models import TenantConfig

        for tenant in get_tenant_model().objects.exclude(schema_name="public").filter(provisioning_status="ready"):
            with tenant_context(tenant):
                cfg = TenantConfig.objects.first()
                if cfg is None or not cfg.emailcraft_api_key:
                    continue
                made = self._copy(
                    cfg.emailcraft_api_key,
                    lambda name: EmailTemplate.objects.filter(name=name, source=TemplateSource.IMPORTED).exists(),
                    lambda name, category, design: EmailTemplate.objects.create(
                        name=name,
                        category=CATEGORIES.get(category, "other"),
                        design=design,
                        source=TemplateSource.IMPORTED,
                    ),
                    dry_run,
                )
                self.stdout.write(f"{tenant.schema_name}: {made} template(s)")
        key = PlatformEmailConfig.load().emailcraft_api_key
        if key:
            made = self._copy(
                key,
                lambda name: PlatformEmailTemplate.objects.filter(name=name).exists(),
                lambda name, _category, design: PlatformEmailTemplate.objects.create(name=name, design=design),
                dry_run,
            )
            self.stdout.write(f"platform: {made} template(s)")

    def _copy(self, key, exists, create, dry_run) -> int:
        made = 0
        try:
            for name, category, json_data in mailcraft_templates(key):
                if exists(name):
                    continue
                try:
                    design = clean_design(json_data or {})
                except DesignError as e:
                    self.stderr.write(f"  skipped {name!r}: {e}")
                    continue
                if not any(blocks_of(design)):
                    continue
                if not dry_run:
                    create(name, category, design)
                made += 1
        except requests.RequestException as e:
            self.stderr.write(f"  MailCraft unreachable: {e}")
        return made
