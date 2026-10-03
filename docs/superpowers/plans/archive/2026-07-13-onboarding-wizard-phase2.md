# Onboarding Wizard — Phase 2 (AI copywriting + provisioning theater) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During provisioning, one `core_ai.structured()` call rewrites the wizard-seeded pages' copy in the coach's voice (brand + niche + description + goals, in the tenant's language), with the static copy as automatic fallback — plus a staged "provisioning theater" progress readout. Free for all signups, guarded by a global monthly USD kill-switch.

**Spec:** `docs/superpowers/specs/2026-07-13-onboarding-wizard-design.md` §3.5 + §3.7.

**⚠️ Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-07-13-onboarding-wizard-phase1.md`) must be fully landed. This plan was written against phase 1's planned interfaces (`wizard_state`, `compose.build_config_overrides`, `_apply_wizard_answers` in `tasks.py`, `wizard.json` catalogs). **Before executing, diff those against the landed code** — if phase 1 execution drifted (renamed helpers, different block ids), adjust the references here first; the task structure stands.

**Architecture:** New `ai_compose.py` beside phase 1's `compose.py`: build a brief from wizard answers + the statically-composed pages, one structured call (pydantic-validated block-copy updates), apply through a per-block-type writable-field whitelist with length caps + `sanitize_rich_text`. Called from `_apply_wizard_answers` between `build_config_overrides` and the config save, wrapped in a 90-second hard timeout; ANY failure leaves the static copy standing and records `ai_compose_status`. Usage/budget mirrors `apps/blog/ai.py` + `BlogAiUsage` exactly. Theater = `provisioning_stage` checkpoints in `wizard_state`, surfaced through the existing `status/` poll and mapped to friendly bilingual lines on the provisioning screen.

**Tech Stack:** `apps.core.ai` shared provider (anthropic | cli), pydantic, Django/Celery, next-intl.

**Spec deviations (deliberate):** (1) §3.5's "include/omit decisions for the layout's optional blocks" is dropped — phase 1 made the block set fully deterministic from layout pick + goals, and the AI rewrites COPY only; a tighter contract that can never override a user's layout choice. FAQ item counts (3–6) remain the AI's call. (2) `ONBOARDING_AI_ENABLED` is an added off-switch the spec didn't name — needed because dev/e2e stacks run `AI_PROVIDER=cli` and must be able to provision deterministically. (3) The stage list folds the spec's illustrative `users` into `config` and `logo` into `finalizing` (five user-visible stages).

## Global Constraints

- Everything from the phase-1 plan's Global Constraints applies (container pytest, `make test-fresh` after migrations, `@authentication_classes([])` rule, zero-warning lint, EN/TR parity, frontends linted manually).
- The AI may ONLY rewrite whitelisted text fields on blocks that already exist. It cannot add/remove blocks, touch `testimonials` blocks (no fabricated social proof — spec rule), change block types, pages, ids, images, or hrefs.
- Copy language = tenant locale (TR region → Turkish, else English), stated in the user brief — the static system prompt stays byte-identical across tenants (prompt-caching pattern from `apps/blog/ai.py`).
- Cost accounting mirrors `BlogAiUsage` semantics: `usd_spent` accrues on EVERY attempt (success or failure); the success counter increments only on success; global kill-switch sums the month across all tenants.
- One compose per tenant ever: if `wizard_state.ai_compose_status` is already set, a Celery retry skips the AI call (idempotency).
- Provisioning must NEVER fail because of AI: every failure path degrades to static copy with `ai_compose_status="failed"` (or `"skipped"` when unavailable/disabled/over-budget).
- New settings: `ONBOARDING_AI_ENABLED` (default on; off = deterministic e2e/dev), `ONBOARDING_AI_MODEL` (default `claude-sonnet-5`), `ONBOARDING_AI_MONTHLY_BUDGET_USD` (default `20`).

## File Structure (phase 2)

Backend — create:
- `backend/apps/core/onboarding/ai_compose.py` — brief builder, pydantic output models, writable-field whitelist, apply-with-sanitization, availability + usage accounting, `compose_pages(...)` entry point.
- `backend/apps/core/tests/test_ai_compose.py`, `backend/apps/core/tests/test_provisioning_stage.py`.

Backend — modify:
- `backend/apps/core/models.py` (+migration: `OnboardingAiUsage`), `backend/config/settings/base.py` (3 settings), `backend/apps/core/admin_panels.py` (adminkit registration), `backend/apps/core/tasks.py` (compose call + stage checkpoints), `backend/apps/core/onboarding/views.py` (`provisioning_status` returns `stage`), `backend/apps/core/tests/test_wizard_provision.py` (extend).

Frontend-main — modify:
- `frontend-main/src/app/signup/verify/page.tsx` (staged provisioning lines), `frontend-main/messages/{en,tr}/wizard.json` (`wizard.provisioning.*` keys).

---

### Task 1: `OnboardingAiUsage` model + settings + superadmin registration

**Files:**
- Modify: `backend/apps/core/models.py` (directly after `BlogAiUsage`, ~line 438)
- Modify: `backend/config/settings/base.py` (after the blog-AI block, ~line 292)
- Modify: `backend/apps/core/admin_panels.py` (mirror the `BlogAiUsage` registration — find it with `grep -n "BlogAiUsage" backend/apps/core/admin_panels.py` and register `OnboardingAiUsage` identically, key `onboarding-ai-usage`, list read-only)
- Create: migration via makemigrations
- Test: `backend/apps/core/tests/test_ai_compose.py` (create — usage tests here; compose tests join in Task 2)

**Interfaces:**
- Produces: `OnboardingAiUsage(tenant_schema, month, composes_used, usd_spent)` — public-schema, unique per (tenant_schema, month); settings `ONBOARDING_AI_ENABLED: bool`, `ONBOARDING_AI_MODEL: str`, `ONBOARDING_AI_MONTHLY_BUDGET_USD: float`. Task 2's accounting helpers read/write this model.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_ai_compose.py`:

```python
import pytest
from django.db import IntegrityError

from apps.core.models import OnboardingAiUsage

pytestmark = pytest.mark.django_db


def test_usage_row_unique_per_tenant_month():
    OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")
    with pytest.raises(IntegrityError):
        OnboardingAiUsage.objects.create(tenant_schema="glow", month="2026-07")


def test_usage_defaults():
    row = OnboardingAiUsage.objects.create(tenant_schema="glow2", month="2026-07")
    assert row.composes_used == 0
    assert float(row.usd_spent) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py -v`
Expected: FAIL — `ImportError: cannot import name 'OnboardingAiUsage'`.

- [ ] **Step 3: Implement model + settings + registration**

In `backend/apps/core/models.py`, directly after the `BlogAiUsage` class, add:

```python
class OnboardingAiUsage(models.Model):
    """Durable per-tenant-per-month accounting for the signup-wizard page
    compose (apps.core.onboarding.ai_compose) — same design as BlogAiUsage:
    ``usd_spent`` accrues on EVERY attempt so a systematic-failure loop still
    trips the global kill-switch; ``composes_used`` increments only on
    success (informational — the real once-only guard is
    wizard_state.ai_compose_status)."""

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    composes_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_schema", "month"], name="uniq_onboarding_ai_usage_tenant_month"
            ),
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.composes_used} composes / ${self.usd_spent}"
```

In `backend/config/settings/base.py`, directly after the blog-AI block (`BLOG_AI_MONTHLY_BUDGET_USD` line), add:

```python
# --- Onboarding wizard page compose (apps.core.onboarding.ai_compose;
# provider from AI_PROVIDER). Free for all signups -> its own off-switch so
# dev/e2e stacks (AI_PROVIDER=cli) can provision deterministically.
ONBOARDING_AI_ENABLED = os.environ.get("ONBOARDING_AI_ENABLED", "true").lower() == "true"
ONBOARDING_AI_MODEL = os.environ.get("ONBOARDING_AI_MODEL", "claude-sonnet-5")
# Global monthly USD kill-switch across ALL onboarding composes (attempts included).
ONBOARDING_AI_MONTHLY_BUDGET_USD = float(os.environ.get("ONBOARDING_AI_MONTHLY_BUDGET_USD", "20"))
```

In `backend/apps/core/admin_panels.py`: register `OnboardingAiUsage` exactly like `BlogAiUsage` (same list fields adjusted to `composes_used`, read-only, key `onboarding-ai-usage`). Then check the existing registration-coverage test: `docker compose exec django pytest apps/core/tests/test_ai_admin_registrations.py -v` — if it enumerates usage models, add `OnboardingAiUsage` to its expected set.

Generate + apply the migration:

```bash
docker compose exec django python manage.py makemigrations core
make migrate-shared
```

- [ ] **Step 4: Run tests (fresh DB — new migration)**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py apps/core/tests/test_ai_admin_registrations.py -v --create-db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/config/settings/base.py backend/apps/core/admin_panels.py backend/apps/core/tests/test_ai_compose.py backend/apps/core/tests/test_ai_admin_registrations.py
git commit -m "feat(onboarding): OnboardingAiUsage meter + compose settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `ai_compose.py` — brief, structured call, whitelisted apply

**Files:**
- Create: `backend/apps/core/onboarding/ai_compose.py`
- Test: `backend/apps/core/tests/test_ai_compose.py` (extend)

**Interfaces:**
- Consumes: `core_ai.structured/available/AiError` (`apps/core/ai.py`), `sanitize_rich_text` (`apps/tenant_config/defaults.py`), `OnboardingAiUsage` (Task 1), the pages dict shape produced by phase 1's `compose.build_config_overrides()["pages"]`.
- Produces (Task 3 calls these):
  - `compose_available() -> bool` — enabled + provider available + global monthly budget not exhausted.
  - `compose_pages(pages: dict, *, brand_name, niche, description, goals, locale, tenant_schema) -> dict` — returns a NEW pages dict with AI copy applied. Raises `ComposeError` on any provider/validation failure (caller falls back). Records usage spend on every attempt, success count on success.
  - `WRITABLE_FIELDS: dict[block_type, tuple[field, ...]]` and `FIELD_CAPS: dict[field, int]` — the trust boundary.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_ai_compose.py`:

```python
from decimal import Decimal
from types import SimpleNamespace

from apps.core.onboarding import ai_compose

PAGES = {
    "home": {
        "blocks": [
            {"id": "blk_hero", "type": "hero", "enabled": True, "layout": "centered",
             "heading": "Welcome to Glow", "subheading": "Old sub", "ctaText": "Browse",
             "ctaHref": "/courses", "bgImage": {"url": None, "photo_id": "9"},
             "overlay": "dark", "overlayStrength": "medium"},
            {"id": "blk_testimonials", "type": "testimonials", "enabled": True,
             "heading": "What students say", "items": [{"name": "Priya", "text": "Real quote"}]},
            {"id": "blk_cta", "type": "cta", "enabled": True, "heading": "Ready?",
             "buttonText": "Join", "buttonHref": "/courses"},
        ]
    },
    "faq": {"blocks": [{"id": "blk_faq", "type": "faq", "enabled": True,
                        "heading": "FAQ", "items": [{"q": "Old?", "a": "Old."}]}]},
}


def _fake_structured(blocks):
    """Monkeypatch factory: core_ai.structured returning the given block updates."""
    def fake(**kwargs):
        output_model = kwargs["output_model"]
        parsed = output_model.model_validate({"blocks": blocks})
        return parsed, 0.03, "claude-sonnet-5"
    return fake


def _compose(monkeypatch, blocks, **overrides):
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured(blocks))
    kwargs = {"brand_name": "Glow", "niche": "yoga", "description": "Vinyasa for busy people",
              "goals": ["sell_courses"], "locale": "en", "tenant_schema": "glow"}
    kwargs.update(overrides)
    return ai_compose.compose_pages(PAGES, **kwargs)


def test_applies_whitelisted_copy(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_hero", "heading": "Yoga for busy people",
         "subheading": "Calm in 20 minutes a day", "ctaText": "Start today"},
        {"page": "home", "block_id": "blk_cta", "heading": "Your mat is waiting", "buttonText": "Begin"},
    ])
    hero = out["home"]["blocks"][0]
    assert hero["heading"] == "Yoga for busy people"
    assert hero["ctaText"] == "Start today"
    assert hero["ctaHref"] == "/courses"  # non-writable fields untouched
    assert hero["bgImage"] == {"url": None, "photo_id": "9"}
    assert out["home"]["blocks"][2]["buttonText"] == "Begin"
    # Input dict not mutated:
    assert PAGES["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_testimonials_never_touched(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_testimonials", "heading": "Hacked",
         "items": [{"q": "x", "a": "y"}]},
    ])
    assert out["home"]["blocks"][1]["heading"] == "What students say"
    assert out["home"]["blocks"][1]["items"] == [{"name": "Priya", "text": "Real quote"}]


def test_unknown_block_and_page_ignored(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_nope", "heading": "X"},
        {"page": "basement", "block_id": "blk_hero", "heading": "X"},
    ])
    assert out["home"]["blocks"][0]["heading"] == "Welcome to Glow"


def test_length_caps_and_faq_items(monkeypatch):
    out = _compose(monkeypatch, [
        {"page": "home", "block_id": "blk_hero", "heading": "H" * 500},
        {"page": "faq", "block_id": "blk_faq",
         "items": [{"q": f"Q{i}?", "a": "A" * 900} for i in range(10)]},
    ])
    assert len(out["home"]["blocks"][0]["heading"]) == ai_compose.FIELD_CAPS["heading"]
    faq = out["faq"]["blocks"][0]
    assert len(faq["items"]) == ai_compose.MAX_FAQ_ITEMS
    assert all(len(item["a"]) <= ai_compose.FIELD_CAPS["a"] for item in faq["items"])


def test_body_is_sanitized(monkeypatch):
    pages = {"about": {"blocks": [{"id": "blk_intro", "type": "richText", "enabled": True,
                                   "heading": "About", "body": "old"}]}}
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured(
        [{"page": "about", "block_id": "blk_intro", "body": "<p>Hi</p><script>evil()</script>"}]
    ))
    out = ai_compose.compose_pages(pages, brand_name="G", niche="yoga", description="",
                                   goals=[], locale="en", tenant_schema="glow")
    assert "<script>" not in out["about"]["blocks"][0]["body"]
    assert "<p>Hi</p>" in out["about"]["blocks"][0]["body"]


def test_locale_reaches_prompt(monkeypatch):
    seen = {}
    def spy(**kwargs):
        seen["user"] = kwargs["user"]
        output_model = kwargs["output_model"]
        return output_model.model_validate({"blocks": []}), 0.01, "m"
    monkeypatch.setattr(ai_compose.core_ai, "structured", spy)
    ai_compose.compose_pages(PAGES, brand_name="Glow", niche="yoga", description="desc",
                             goals=["sell_courses"], locale="tr", tenant_schema="glow")
    assert "Turkish" in seen["user"]
    assert "Glow" in seen["user"] and "desc" in seen["user"]


def test_usage_recorded_on_failure_and_success(monkeypatch):
    from apps.core import ai as core_ai_mod

    def boom(**kwargs):
        raise core_ai_mod.AiError("provider down", cost_usd=0.01)
    monkeypatch.setattr(ai_compose.core_ai, "structured", boom)
    with pytest.raises(ai_compose.ComposeError):
        ai_compose.compose_pages(PAGES, brand_name="G", niche="yoga", description="",
                                 goals=[], locale="en", tenant_schema="spend1")
    row = ai_compose.tenant_usage("spend1")
    row.refresh_from_db()
    assert row.usd_spent == Decimal("0.0100")
    assert row.composes_used == 0

    _compose(monkeypatch, [], tenant_schema="spend1")
    row.refresh_from_db()
    assert row.composes_used == 1


def test_compose_available_respects_flag_and_budget(monkeypatch, settings):
    monkeypatch.setattr(ai_compose.core_ai, "available", lambda: True)
    settings.ONBOARDING_AI_ENABLED = False
    assert ai_compose.compose_available() is False
    settings.ONBOARDING_AI_ENABLED = True
    assert ai_compose.compose_available() is True
    settings.ONBOARDING_AI_MONTHLY_BUDGET_USD = 0.005
    ai_compose.record_spend("budget-tenant", 0.01)
    assert ai_compose.compose_available() is False
```

Note: if `core_ai.AiError`'s constructor does not take `cost_usd` (check `backend/apps/core/ai.py` — `apps/blog/ai.py:190` reads `exc.cost_usd`, so it does), adjust the `boom` fake to match the real signature rather than changing production code.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py -v`
Expected: the two Task-1 tests PASS; everything else FAILS with `AttributeError: module ... has no attribute 'compose_pages'` (create the module in Step 3; until then the import line itself errors — that's fine).

- [ ] **Step 3: Implement ai_compose.py**

Create `backend/apps/core/onboarding/ai_compose.py`:

```python
"""AI copywriting for the onboarding wizard (phase 2).

One structured call rewrites the copy of the statically-composed pages in
the coach's voice. Trust boundary: the model can ONLY submit text for
(page, block_id) pairs that already exist, only for fields whitelisted for
that block type, clamped to length caps, rich text sanitized. Testimonials
are never writable (no fabricated social proof).

Usage/budget accounting mirrors apps.blog.ai + BlogAiUsage.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Sum
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.models import OnboardingAiUsage
from apps.tenant_config.defaults import sanitize_rich_text

MAX_OUTPUT_TOKENS = 3000
MAX_FAQ_ITEMS = 6
MAX_BLOCK_UPDATES = 40

# The ONLY fields the model may rewrite, per block type. testimonials is
# deliberately absent. hrefs/images/layout are never writable.
WRITABLE_FIELDS = {
    "hero": ("heading", "subheading", "ctaText"),
    "richText": ("heading", "body"),
    "imageText": ("heading", "body"),
    "courseGrid": ("heading",),
    "upcomingEvents": ("heading",),
    "storeProducts": ("heading",),
    "pricingPlans": ("heading", "subheading"),
    "cta": ("heading", "buttonText"),
    "faq": ("heading", "items"),
    "contact": ("heading", "intro"),
}

FIELD_CAPS = {
    "heading": 120,
    "subheading": 200,
    "ctaText": 40,
    "buttonText": 40,
    "intro": 200,
    "body": 2000,
    "q": 150,
    "a": 500,
}


class ComposeError(Exception):
    pass


class _QA(BaseModel):
    q: str = ""
    a: str = ""


class _BlockCopy(BaseModel):
    page: str
    block_id: str
    heading: str | None = None
    subheading: str | None = None
    body: str | None = None
    ctaText: str | None = None
    buttonText: str | None = None
    intro: str | None = None
    items: list[_QA] | None = None  # faq only


class _ComposeResult(BaseModel):
    blocks: list[_BlockCopy] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching) —
# everything tenant-specific goes into the user brief.
SYSTEM_PROMPT = """You write website copy for a solo coach's brand-new platform.

You receive the coach's brief and their site's current pages as a list of
blocks with their writable fields and current placeholder text. Rewrite the
copy in the coach's voice: warm, concrete, second person, no hype.

Hard rules:
- Write in the language named in the brief.
- Only return blocks you are improving; only use the listed writable fields.
- NEVER invent facts, statistics, credentials, student quotes, prices, or
  guarantees. If the brief gives no detail, stay general but warm.
- For faq items, write 3-6 practical questions a NEW student would actually
  ask this coach, with honest, reassuring answers.
- body fields: plain sentences or simple <p>/<ul><li> HTML only.
- Respect the character caps given per field.
"""


def current_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema: str, month: str | None = None) -> OnboardingAiUsage:
    row, _ = OnboardingAiUsage.objects.get_or_create(
        tenant_schema=tenant_schema, month=month or current_month()
    )
    return row


def record_spend(tenant_schema: str, usd: float) -> None:
    row = tenant_usage(tenant_schema)
    OnboardingAiUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + Decimal(str(usd)))


def _record_success(tenant_schema: str) -> None:
    row = tenant_usage(tenant_schema)
    OnboardingAiUsage.objects.filter(pk=row.pk).update(composes_used=F("composes_used") + 1)


def _global_spend(month: str | None = None) -> float:
    total = OnboardingAiUsage.objects.filter(month=month or current_month()).aggregate(
        t=Sum("usd_spent")
    )["t"]
    return float(total or 0)


def compose_available() -> bool:
    if not settings.ONBOARDING_AI_ENABLED:
        return False
    if not core_ai.available():
        return False
    return _global_spend() < settings.ONBOARDING_AI_MONTHLY_BUDGET_USD


def _brief(pages: dict, *, brand_name, niche, description, goals, locale) -> str:
    language = "Turkish" if locale == "tr" else "English"
    lines = [
        "<coach_brief>",
        f"Brand: {brand_name or 'a new coaching brand'}",
        f"Niche: {niche}",
        f"In their own words: {description or '-'}",
        f"They plan to offer: {', '.join(goals) or '-'}",
        f"Write ALL copy in: {language}",
        "</coach_brief>",
        "",
        "<current_pages>",
    ]
    for page_key, page in pages.items():
        for block in page.get("blocks", []):
            writable = WRITABLE_FIELDS.get(block.get("type"), ())
            if not writable:
                continue
            lines.append(f"page={page_key} block_id={block['id']} type={block['type']}")
            for field in writable:
                if field == "items":
                    lines.append(f"  items: {len(block.get('items') or [])} faq entries (write 3-{MAX_FAQ_ITEMS})")
                else:
                    current = str(block.get(field) or "")[:200]
                    lines.append(f'  {field} (max {FIELD_CAPS[field]} chars): "{current}"')
    lines.append("</current_pages>")
    return "\n".join(lines)


def _clamp(value: str, field: str) -> str:
    return str(value)[: FIELD_CAPS[field]].strip()


def _apply(pages: dict, updates: list[_BlockCopy]) -> dict:
    import copy

    out = copy.deepcopy(pages)
    index = {}
    for page_key, page in out.items():
        for block in page.get("blocks", []):
            index[(page_key, block["id"])] = block

    for update in updates[:MAX_BLOCK_UPDATES]:
        block = index.get((update.page, update.block_id))
        if block is None:
            continue
        writable = WRITABLE_FIELDS.get(block.get("type"), ())
        for field in ("heading", "subheading", "ctaText", "buttonText", "intro"):
            value = getattr(update, field)
            if field in writable and value:
                block[field] = _clamp(value, field)
        if "body" in writable and update.body:
            block["body"] = sanitize_rich_text(_clamp(update.body, "body"))
        if "items" in writable and update.items is not None:
            items = [
                {"q": _clamp(item.q, "q"), "a": _clamp(item.a, "a")}
                for item in update.items[:MAX_FAQ_ITEMS]
                if item.q.strip() and item.a.strip()
            ]
            if items:
                block["items"] = items
    return out


def compose_pages(pages: dict, *, brand_name, niche, description, goals, locale, tenant_schema) -> dict:
    """One structured call -> new pages dict with AI copy applied.

    Raises ComposeError on ANY provider/validation failure — the caller
    falls back to the static pages. Spend is recorded even on failure.
    """
    user_prompt = _brief(
        pages, brand_name=brand_name, niche=niche, description=description, goals=goals, locale=locale
    )
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=user_prompt,
            output_model=_ComposeResult,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise ComposeError(str(exc)) from exc
    record_spend(tenant_schema, float(cost or 0))
    result = _apply(pages, parsed.blocks)
    _record_success(tenant_schema)
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/ai_compose.py backend/apps/core/tests/test_ai_compose.py
git commit -m "feat(onboarding): AI page-copy compose with whitelisted apply + budget

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire compose into `_apply_wizard_answers` (90s cap, non-fatal)

**Files:**
- Modify: `backend/apps/core/tasks.py`
- Test: `backend/apps/core/tests/test_wizard_provision.py` (extend — phase-1 file)

**Interfaces:**
- Consumes: `ai_compose.compose_available/compose_pages/ComposeError` (Task 2), phase 1's `_apply_wizard_answers`.
- Produces: `wizard_state.ai_compose_status ∈ {"ok", "failed", "skipped"}` persisted on the tenant (phase 4 reads it for funnel stats). Rules: set exactly once (Celery retry with status already set skips the call); ANY failure → static copy stands; the AI call runs in a worker thread with a **90-second** hard cap (thread runs in the public schema — `ai_compose` touches only public-schema usage rows).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_provision.py`:

```python
def _wiz_tenant(cleanup, slug, extra_state=None):
    cleanup.append(slug)
    tenant = _make_tenant(slug, WIZARD_ANSWERS)
    if extra_state:
        tenant.wizard_state = {**tenant.wizard_state, **extra_state}
        tenant.save(update_fields=["wizard_state"])
    return tenant


def _home_hero_heading(tenant):
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        return TenantConfig.objects.first().pages["home"]["blocks"][0]["heading"]


def test_ai_compose_ok_applies_copy(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    def fake_compose(pages, **kwargs):
        import copy

        out = copy.deepcopy(pages)
        out["home"]["blocks"][0]["heading"] = "AI WROTE THIS"
        return out

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(ai_compose, "compose_pages", fake_compose)
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-ok"))
    assert tenant.provisioning_status == "ready"
    assert tenant.wizard_state["ai_compose_status"] == "ok"
    assert _home_hero_heading(tenant) == "AI WROTE THIS"


def test_ai_compose_failure_falls_back_to_static(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    def boom(pages, **kwargs):
        raise ai_compose.ComposeError("provider down")

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(ai_compose, "compose_pages", boom)
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-fail"))
    assert tenant.provisioning_status == "ready"  # provisioning NEVER fails on AI
    assert tenant.wizard_state["ai_compose_status"] == "failed"
    assert _home_hero_heading(tenant) == "Find Your Balance Through Yoga"  # static niche copy stands


def test_ai_compose_skipped_when_unavailable_and_idempotent(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    calls = []
    monkeypatch.setattr(ai_compose, "compose_available", lambda: False)
    monkeypatch.setattr(ai_compose, "compose_pages", lambda *a, **k: calls.append(1))
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-skip"))
    assert tenant.wizard_state["ai_compose_status"] == "skipped"
    assert calls == []

    # Retry with a status already recorded: no second attempt even if available.
    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    _provision(tenant)
    assert calls == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py -v`
Expected: the three new tests FAIL (`ai_compose_status` missing); phase-1 tests still PASS.

- [ ] **Step 3: Implement the wiring**

In `backend/apps/core/tasks.py`, add module-level (after `_apply_wizard_answers`):

```python
AI_COMPOSE_TIMEOUT_SECONDS = 90


def _compose_pages_with_ai(tenant, answers, pages, preferred_locale):
    """AI copy pass with a hard time cap. Returns (pages, status). NEVER
    raises: any failure returns the static pages unchanged. Runs the call in
    a worker thread (fresh connection, public schema) so a hung provider
    can't stall provisioning past the cap."""
    from apps.core.onboarding import ai_compose

    if not ai_compose.compose_available():
        return pages, "skipped"

    from concurrent.futures import ThreadPoolExecutor
    from concurrent.futures import TimeoutError as FutureTimeout

    def run():
        from django.db import close_old_connections

        close_old_connections()
        try:
            return ai_compose.compose_pages(
                pages,
                brand_name=tenant.name,
                niche=answers.get("niche") or "general",
                description=answers.get("description") or "",
                goals=list(answers.get("goals") or []),
                locale=preferred_locale,
                tenant_schema=tenant.schema_name,
            )
        finally:
            close_old_connections()

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(run).result(timeout=AI_COMPOSE_TIMEOUT_SECONDS), "ok"
    except FutureTimeout:
        logger.warning("onboarding AI compose timed out for %s", tenant.slug)
        return pages, "failed"
    except Exception:
        logger.exception("onboarding AI compose failed for %s", tenant.slug)
        return pages, "failed"
```

In `_apply_wizard_answers`, between `overrides = build_config_overrides(...)` and the `setattr` loop, add:

```python
        state = dict(tenant.wizard_state or {})
        if not state.get("ai_compose_status"):
            overrides["pages"], status = _compose_pages_with_ai(
                tenant, answers, overrides["pages"], preferred_locale
            )
            state["ai_compose_status"] = status
            tenant.wizard_state = state
            tenant.save(update_fields=["wizard_state"])
```

(Note `_apply_wizard_answers` runs inside `tenant_context`, but `Tenant` and `OnboardingAiUsage` are public-schema models — reachable from any schema; the worker thread starts on the public schema anyway.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py apps/core/tests/test_ai_compose.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): AI compose in provisioning with 90s cap + static fallback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Provisioning-stage checkpoints + `stage` in the status endpoint

**Files:**
- Modify: `backend/apps/core/tasks.py`
- Modify: `backend/apps/core/onboarding/views.py` (`provisioning_status`)
- Test: `backend/apps/core/tests/test_provisioning_stage.py` (create)

**Interfaces:**
- Produces: `_set_provisioning_stage(tenant, stage)` in `tasks.py`; stage values (in order): `"schema" → "config" → "seed" → "ai_copy" → "finalizing"` stored in `wizard_state.provisioning_stage`; `GET /api/v1/onboarding/status/` response gains `"stage": <str|null>`. Task 5's frontend maps exactly these five values.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_provisioning_stage.py`:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="stage_studio",
        defaults={
            "name": "Stage Studio",
            "slug": "stage-studio",
            "subdomain": "stage-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "provisioning"
    t.wizard_state = {"provisioning_stage": "ai_copy"}
    t.save(update_fields=["provisioning_status", "wizard_state"])
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="stage_studio").delete()


def test_status_endpoint_exposes_stage(tenant):
    resp = APIClient(HTTP_HOST="shared-test.localhost").get(
        "/api/v1/onboarding/status/", {"slug": "stage-studio"}
    )
    assert resp.status_code == 200
    assert resp.json()["stage"] == "ai_copy"


def test_status_endpoint_stage_null_without_wizard(tenant):
    tenant.wizard_state = {}
    tenant.save(update_fields=["wizard_state"])
    resp = APIClient(HTTP_HOST="shared-test.localhost").get(
        "/api/v1/onboarding/status/", {"slug": "stage-studio"}
    )
    assert resp.json()["stage"] is None


def test_set_stage_helper_preserves_other_state():
    from apps.core.tasks import _set_provisioning_stage

    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name="stage_h", name="H", slug="stage-h", subdomain="stage-h",
        owner_email="h@x.com", wizard_state={"answers": {"niche": "yoga"}},
    )
    try:
        _set_provisioning_stage(t, "seed")
        t.refresh_from_db()
        assert t.wizard_state["provisioning_stage"] == "seed"
        assert t.wizard_state["answers"] == {"niche": "yoga"}
    finally:
        Tenant.objects.filter(schema_name="stage_h").delete()
```

Also append one assertion to `test_wizard_answers_override_niche_defaults` in `backend/apps/core/tests/test_wizard_provision.py` (after the existing tenant assertions):

```python
    assert tenant.wizard_state["provisioning_stage"] == "finalizing"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_provisioning_stage.py -v`
Expected: FAIL — no `stage` key, no `_set_provisioning_stage`.

- [ ] **Step 3: Implement**

In `backend/apps/core/tasks.py`, add module-level:

```python
def _set_provisioning_stage(tenant, stage):
    """Best-effort theater checkpoint for the signup progress screen."""
    state = dict(tenant.wizard_state or {})
    state["provisioning_stage"] = stage
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])
```

In `provision_tenant`, add checkpoints (each one line, in order):
- directly after `tenant.provisioning_status = "provisioning"` + save: `_set_provisioning_stage(tenant, "schema")`
- directly before the `with tenant_context(tenant):` owner/config block: `_set_provisioning_stage(tenant, "config")`
- directly before the `if niche:` seed block: `_set_provisioning_stage(tenant, "seed")`
- in `_apply_wizard_answers`, directly BEFORE the compose block added in Task 3: `_set_provisioning_stage(tenant, "ai_copy")`
- directly before `tenant.provisioning_status = "ready"`: `_set_provisioning_stage(tenant, "finalizing")`

In `backend/apps/core/onboarding/views.py` → `provisioning_status`, add to the response dict:

```python
            "stage": (tenant.wizard_state or {}).get("provisioning_stage"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_provisioning_stage.py apps/core/tests/test_wizard_provision.py apps/core/tests/test_onboarding_handoff.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/onboarding/views.py backend/apps/core/tests/test_provisioning_stage.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): provisioning stage checkpoints exposed via status endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Provisioning theater on the signup screen (EN + TR)

**Files:**
- Modify: `frontend-main/src/app/signup/verify/page.tsx`
- Modify: `frontend-main/messages/en/wizard.json` + `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: `stage` from the status poll (Task 4), existing `startPolling` in `page.tsx`, `wizard` i18n namespace (phase 1).
- Produces: the provisioning screen cycles friendly stage lines; unknown/missing stage falls back to the existing `verify.creating` line, so it degrades cleanly for legacy tenants.

- [ ] **Step 1: Add the stage strings**

In `frontend-main/messages/en/wizard.json`, add inside the `wizard` object:

```json
    "provisioning": {
      "schema": "Building your space…",
      "config": "Setting up your platform…",
      "seed": "Adding your draft content…",
      "ai_copy": "Writing your pages in your voice…",
      "finalizing": "Final touches…"
    }
```

In `frontend-main/messages/tr/wizard.json` (same position):

```json
    "provisioning": {
      "schema": "Alanın hazırlanıyor…",
      "config": "Platformun kuruluyor…",
      "seed": "Taslak içeriklerin ekleniyor…",
      "ai_copy": "Sayfaların senin ağzından yazılıyor…",
      "finalizing": "Son dokunuşlar…"
    }
```

Run: `node scripts/check-i18n-parity.mjs` → exit 0.

- [ ] **Step 2: Surface the stage in page.tsx**

In `frontend-main/src/app/signup/verify/page.tsx`:

1. Add next to the other hooks: `const tw = useTranslations("wizard");` and `const [stage, setStage] = useState<string | null>(null);`
2. In `startPolling`'s success branch (where `statusData` is parsed), before the ready/failed checks add:

```tsx
            setStage(typeof statusData.stage === "string" ? statusData.stage : null);
```

3. In the `state === "provisioning"` render block, replace the single `{t("verify.creating")} <strong>…</strong>` line's text with a stage-aware line (domain line stays):

```tsx
const KNOWN_STAGES = ["schema", "config", "seed", "ai_copy", "finalizing"] as const;
```

(module scope, above the component), and in the JSX:

```tsx
          <span>
            {stage && (KNOWN_STAGES as readonly string[]).includes(stage)
              ? tw(`provisioning.${stage}`)
              : t("verify.creating")}{" "}
            <strong className="text-foreground">{domain || slug}</strong>
          </span>
```

- [ ] **Step 3: Verify build + lint + parity**

Run: `node scripts/check-i18n-parity.mjs && cd frontend-main && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Manual smoke**

`make dev`, run a signup through the wizard: the provisioning screen should step through at least "Building your space…" → "Adding your draft content…" → "Final touches…" (the 2s poll may skip fast stages — fine).

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/app/signup/verify/page.tsx frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): staged provisioning theater on the signup screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verification sweep

**Files:** none — release gate.

- [ ] **Step 1: Backend suite on fresh DB (Task 1 added a migration)**

Run: `make test-fresh`
Expected: 0 failures.

- [ ] **Step 2: Lint + parity + frontend build**

Run: `make lint && cd frontend-main && npm run lint && npm run build && cd ..`
Expected: fully green, zero warnings.

- [ ] **Step 3: e2e determinism decision, then full e2e**

The dev stack runs `AI_PROVIDER=cli`, so signup e2e would invoke the real `claude` CLI during provisioning (slow, non-deterministic). For the e2e run, set `ONBOARDING_AI_ENABLED=false` in the repo-root `.env`, restart (`make dev`), then:

Run: `make e2e`
Expected: all specs pass; the signup specs behave exactly as phase 1 (compose status "skipped", static copy).

- [ ] **Step 4: Manual bilingual click-through with AI ON**

Re-enable (`ONBOARDING_AI_ENABLED=true`, restart). EN signup with a rich description ("I teach vinyasa to busy professionals…") → after ready, the tenant home hero/about/FAQ read personalized (not the stock niche copy); check the record:

```bash
docker compose exec django python manage.py shell -c "from apps.core.models import Tenant, OnboardingAiUsage; t=Tenant.objects.order_by('-created_at').first(); print(t.slug, t.wizard_state.get('ai_compose_status')); print(list(OnboardingAiUsage.objects.values()))"
```

Expected: `ok` + one usage row with nonzero `usd_spent`. TR signup (`tr.localhost`) → Turkish page copy. Testimonials still show the demo-marked seed quotes (AI must not have touched them). Superadmin → the `onboarding-ai-usage` panel lists the rows.

- [ ] **Step 5: Wrap up**

Report with evidence (test counts, e2e output, before/after copy screenshots). No push/deploy — owner handles that. Phase 3 (checkout + AI logo) is the remaining planned phase; phase 4 (drop-off email, funnel view) is optional polish.
