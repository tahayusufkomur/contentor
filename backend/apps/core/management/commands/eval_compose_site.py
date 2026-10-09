"""Compose one fixture coach's site on the hidden site-eval scratch tenant with
the real composer, for the manual site-quality eval (`make eval-sites`,
e2e/specs/91-site-eval.spec.ts; spec: docs/superpowers/specs/
2026-10-04-stunning-pages-design.md → "Eval harness").

Resets the tenant to the brief (wizard answers, brand, style, skeleton pages,
no cached site plan), runs ``site_composer.compose_site`` and prints one JSON
line: the host to screenshot, the composed pages and the composer-side
deterministic checks (plan fell back, page build failed, a section shipped
fallback copy, a photo slot is empty). The style may be disabled — the eval
is what gates enabling it."""

import json

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.core.onboarding import ai_compose
from apps.core.onboarding import site_composer as sc
from apps.core.onboarding.compose import build_config_overrides
from apps.core.tasks import _create_default_config
from apps.tenant_config import sections
from apps.tenant_config.models import TenantConfig

SCHEMA = "site_eval"


def _scratch_tenant():
    """The site-eval tenant, created once and reused across briefs."""
    tenant = Tenant.objects.filter(schema_name=SCHEMA).first()
    if tenant is not None:
        return tenant
    slug = SCHEMA.replace("_", "-")
    tenant = Tenant.objects.create(
        name="Site Eval",
        slug=slug,
        subdomain=slug,
        schema_name=SCHEMA,
        owner_email="site-eval@example.com",
        provisioning_status="ready",
        is_published=True,
    )
    Domain.objects.create(domain=f"{slug}.{settings.CONTENTOR_DOMAIN}", tenant=tenant, is_primary=True)
    tenant.create_schema(check_if_exists=True, verbosity=0)
    with tenant_context(tenant):
        _create_default_config(tenant, "en")
        User.objects.create_user(email=tenant.owner_email, name="Site Eval", role="owner", is_staff=True)
    return tenant


def _copy(block, writable) -> dict:
    """The AI-writable text of a block (item lists without their photos)."""
    out = {}
    for name, spec in writable.items():
        value = block.get(name)
        if spec["type"] == "items":
            value = [{k: (item or {}).get(k) for k in spec["fields"]} for item in value or []]
        out[name] = value
    return out


def fallback_sections(page_key, blocks, ctx) -> list[str]:
    """Families on a page whose AI-writable copy is exactly the composer's
    fallback copy — i.e. the AI fill failed for that section."""
    found = []
    for block in blocks:
        family = sections.family_of(block.get("type"))
        writable = sc._writable(family) if family else {}
        if not writable:
            continue
        entry = {"family": family, "variant": block.get("variant")}
        fallback = sc._new_block(entry, sc.fallback_fields(family, page_key, entry["variant"], ctx))
        expected = _copy(fallback, writable)
        if any(expected.values()) and _copy(block, writable) == expected:
            found.append(family)
    return found


def empty_slots(blocks) -> list[str]:
    """'family.slot' for every rendered photo slot left without a photo."""
    found = []
    for block in blocks:
        family = sections.family_of(block.get("type"))
        if not family:
            continue
        skip = sections.unshown_slots(family, block.get("variant"))
        for name, spec in sections.families()[family]["fields"].items():
            slots = []
            if spec["type"] == "image":
                slots.append((name, block.get(name)))
            elif spec["type"] == "items":
                for sub, sub_spec in spec["fields"].items():
                    if sub_spec["type"] == "image":
                        slots += [(f"{name}.{n}", item.get(sub)) for n, item in enumerate(block.get(name) or [])]
            for slot, value in slots:
                if slot not in skip and not ((value or {}).get("photo_id") or (value or {}).get("url")):
                    found.append(f"{family}.{slot}")
    return found


class Command(BaseCommand):
    help = "Compose one eval brief's site on the site-eval scratch tenant (make eval-sites)."

    def add_arguments(self, parser):
        parser.add_argument("--style", required=True)
        parser.add_argument("--brief", required=True, help="one brief from e2e/fixtures/site-eval-briefs.json, as JSON")

    def handle(self, *args, **options):
        style = options["style"]
        if not sections.style(style):
            raise CommandError(f"Unknown style {style!r}. Available: {', '.join(sections.styles())}")
        if not ai_compose.compose_available():
            raise CommandError("AI compose is unavailable (make ai-check) — the eval needs the real composer.")
        brief = json.loads(options["brief"])
        brand, niche, description = brief["brand"], brief["niche"], brief["description"]
        answers = {
            "niche": niche,
            "description": description,
            "description_followups": {"items": brief.get("followups") or []},
            "goals": brief.get("goals") or [],
            "style": style,
        }

        tenant = _scratch_tenant()
        tenant.wizard_state = {"answers": answers}  # drops the previous brief's cached site plan
        tenant.template_niche = niche
        tenant.save(update_fields=["wizard_state", "template_niche"])
        overrides = build_config_overrides(answers, brand_name=brand, landing_sections={})
        with tenant_context(tenant):
            config = TenantConfig.objects.first()
            config.brand_name = brand
            config.navbar_config = overrides["navbar_config"]
            config.enabled_modules = overrides["enabled_modules"]
            config.style = style
            config.pages = sc.skeleton_pages(style, niche=niche, brand_name=brand, description=description)
            config.setup_flow = {}
            config.save()
        cache.delete(f"tenant:{tenant.schema_name}:config")

        sc.compose_site(tenant)

        tenant.refresh_from_db()
        coach = sc._coach_data(tenant, brand)
        ctx = sc._ctx(coach["niche"], brand, coach["description"])
        with tenant_context(tenant):
            config = TenantConfig.objects.first()
        builds = (config.setup_flow or {}).get("page_builds") or {}
        pages = []
        for key in [*sc.SITE_ORDER, "pricing"]:
            if key not in builds:
                continue
            blocks = (config.pages.get(key) or {}).get("blocks") or []
            pages.append(
                {
                    "key": key,
                    "path": sc.PAGE_PATHS[key],
                    "status": builds[key].get("status"),
                    "fallback_sections": fallback_sections(key, blocks, ctx),
                    "empty_slots": empty_slots(blocks),
                }
            )
        plan = (tenant.wizard_state or {}).get("site_plan") or {}
        domain = Domain.objects.filter(tenant=tenant, is_primary=True).values_list("domain", flat=True).first()
        self.stdout.write(json.dumps({"host": domain, "plan_source": plan.get("source"), "pages": pages}))
