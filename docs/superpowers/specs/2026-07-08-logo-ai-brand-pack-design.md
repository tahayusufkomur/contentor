# Logo Studio AI — "Brand Pack" Design

**Date:** 2026-07-08
**Status:** Approved by product owner (design + 3 amendments), pending spec review
**Supersedes:** the "no AI, ever" decision recorded at commit `95c93e9` — explicitly reversed by the product owner on 2026-07-08. Stale "do not reintroduce" comments in `frontend-customer/src/lib/logo/composer.ts:5-6` and `backend/apps/tenant_config/views.py` must be removed as part of this work.

## 1. Problem & goals

The deterministic composer's output feels basic/templated. Root cause (verified in code): every axis is a small closed enum — 64 stock lucide icons, 6 parametric abstract families, 4 initials styles, 24 pre-baked palettes, 5 layouts — and brand semantics only influence an 8-keyword niche table. Two different yoga brands get walls drawn from the identical pool. The removed v1 AI path failed because it could only *pick from that same pool*.

**Goals:**
1. A genuine "wow" for coaches (and the students who see the resulting brand): marks and colors that visibly belong to *this* brand and exist in no template pool.
2. Minimum API spend, by design of the interaction — not by hoping usage stays low.
3. AI is additive and paid-tier-gated: the free deterministic wall remains the instant, always-available baseline; AI becomes a paid-plan perk and upgrade driver.

**Non-goals:** external image-gen APIs (Recraft/gpt-image etc. — raster or opaque output breaks the recipe editor, per-element recolor, darkVariant, and the true-vector brand-kit export; also 5–20× the cost); AI chat/iteration loops; multi-turn refinement.

## 2. Core concept

**One `messages.parse` call per brief submit returns a "Brand Pack":**

- **3 bespoke vector marks** — the model draws original SVG path geometry for this brand, as structured path data (`d` strings in a `0 0 100 100` viewBox) with **role-token fills** (`"mark" | "mark2" | "accent"` — never raw hex inside the mark), so one mark recolors across palettes, the editor's swatch pickers, and the dark-variant export.
- **3 brand-specific palettes** — free-hex harmonies riffing on the tenant's theme primary. (The recipe schema already carries raw hex per element; `palette_id` is optional metadata — no schema change needed for colors.)
- **1 tagline** + a **one-sentence designer rationale per mark** (rendered as card captions — "why it works" is half the wow for a non-technical coach).

The frontend multiplies the pack client-side via a new `composeFromPack(pack, brief, seed)` (3 marks × 3 palettes → ~9 recipes with mulberry32-rolled layout/badge/typography). **Shuffle and "More like this" reuse the cached pack at zero cost.** One API call funds unlimited variation — this is the cost-minimization centerpiece.

## 3. Access gating (product-owner amendments)

1. **Paid tenants only.** Gate on the existing `Tenant.has_paid_platform_plan` (`backend/apps/core/models.py:121` — active/past-due subscription on a non-free plan; same gate as the platform mailbox perk). Free-tier coaches see the AI section in a **locked upsell state**: "✨ AI logo designer — included with paid plans" linking to the upgrade flow. This makes the wow feature an explicit reason to pay (north star: first paying coach).
2. **Hard quota: 5 AI pack generations per tenant per calendar month.** Cache hits and failed calls do not consume quota. No hourly/daily sub-limits — 5/month is the cap.
3. **Both models evaluated before launch:** `LOGO_AI_MODEL` setting; the pre-ship eval wall (§10) generates every eval brief with **both** `claude-sonnet-5` and `claude-haiku-4-5` side by side; the product owner picks the default from that review.

## 4. API contract

### `GET /api/v1/admin/config/logo-brand-pack/status/`
Auth: coach/owner (tenant-scoped). Always non-empty JSON:
```json
{"enabled": true, "eligible": true, "remaining": 4, "reason": null}
```
- `enabled`: `ANTHROPIC_API_KEY` set AND monthly USD budget not tripped.
- `eligible`: `tenant.has_paid_platform_plan`.
- `remaining`: `5 - packs_used_this_month`.
- `reason`: `null | "upgrade_required" | "quota_exhausted" | "disabled"` — drives which UI state the studio shows.

### `POST /api/v1/admin/config/logo-brand-pack/`
Auth: coach/owner. Body: `{niche≤120, style_chips≤3×20, vibe≤200}`. Brand name + theme primary hex derived server-side from `TenantConfig` (as the removed v1 did). Response always non-empty JSON (Cloudflare/clientFetch empty-body gotcha):
```json
{"pack": {...} | null, "source": "ai" | "cache" | "disabled" | "upgrade_required" | "quota_exhausted" | "error", "remaining": 3}
```

**Server lifecycle:**
1. `ANTHROPIC_API_KEY` unset → `source:"disabled"` (zero-AI deployment mode preserved exactly).
2. Not `has_paid_platform_plan` → `source:"upgrade_required"`.
3. **Result cache** lookup: key `logo-ai:v{PROMPT_VERSION}:{sha256(model + brand_name + niche + sorted_chips + vibe + primary_hex)}`, 30-day TTL. Hit → return pack, `source:"cache"`, zero cost, quota untouched. (Prompt version + model in the key so prompt/model iterations never serve stale packs; brand name + theme hex included because they're server-derived — renaming the brand must bust the cache.)
4. **Quota check** (not yet charge): `packs_used_this_month < 5`. Exceeded → `source:"quota_exhausted"`.
5. **Budget kill-switch check**: monthly USD spend row ≥ `LOGO_AI_MONTHLY_BUDGET_USD` (default 15) → `source:"disabled"` + warning log.
6. **The one Anthropic call** (sync, in-view — no Celery in v1):
   ```python
   client = anthropic.Anthropic(api_key=..., timeout=60.0, max_retries=1)
   resp = client.messages.parse(
       model=settings.LOGO_AI_MODEL,          # "claude-sonnet-5" | "claude-haiku-4-5"
       max_tokens=6000,
       system=[{"type": "text", "text": STATIC_PROMPT,   # frozen module constant
                "cache_control": {"type": "ephemeral"}}],
       messages=[{"role": "user", "content": volatile_brief}],
       output_format=_BrandPack,
   )
   ```
   On Sonnet 5, adaptive thinking runs by default — leave it (never send `budget_tokens`; 400). Thinking tokens are billed output and are included in the cost math (§8). On Haiku 4.5 no thinking config is sent.
7. **Budget accounting is charged on EVERY attempt** (estimated on failure, actual from `response.usage` on success) so a systematic-failure loop still trips the kill-switch. **Quota is charged only after a successful parse + validation** (failed calls don't burn the coach's 5).
8. Validate → cache result → return `{pack, source:"ai", remaining}`.

**Error/refusal:** any SDK exception, parse failure, or refusal → `logger.exception` + `source:"error"` (quota uncharged, budget charged with estimate). `stop_reason == "max_tokens"` → **salvage**: keep marks/palettes that parsed and validated; only if zero marks survive is it an error.

**Escape hatch (documented, not built in v1):** if gunicorn worker occupancy or the sync wait ever becomes a problem, the same route grows a `202 {"job_id"}` + poll variant (Celery is already in the stack). The response contract above tolerates that addition without breaking clients. **Pre-ship check: verify gunicorn's worker timeout ≥ 60s** (a Sonnet call with thinking realistically takes 15–40s); if it's lower, either raise it or ship the Celery variant instead.

## 5. Prompt architecture

- **Static cacheable system prefix** (~2,200–2,500 tokens, frozen module constant `STATIC_PROMPT` + `PROMPT_VERSION` bumped on any edit; above Sonnet 5's 2,048-token minimum cacheable prefix — note Haiku's minimum is 4,096, so on Haiku the prefix simply won't prompt-cache; that's accepted, caching is bonus not load-bearing):
  - SVG drafting rules: viewBox `0 0 100 100`, 2–6 filled paths per mark, absolute commands (M/L/H/V/C/S/Q/T/A/Z), no strokes, `fill_rule` evenodd allowed for counters/negative space, minimum feature size ~4 units (must read at 48px favicon), per-`d` budget ≤400 chars.
  - Taste rules: niche-semantic symbolism, negative-space and monogram techniques, ≥1 mark integrating mark+letterform; all fills luminance > 0.25 (headroom for darkVariant lighten()).
  - 2–3 few-shot exemplar marks as literal path JSON — the single biggest quality lever; hand-curated before launch.
  - Palette rules: 4 roles (primary/secondary/accent/ink), harmony + contrast requirements, must riff on the tenant theme hex.
  - The 20-font catalog with vibe tags (fonts must be in-catalog — only those are loaded client-side).
  - Rationale + tagline rules ("tagline only when obvious"; rationale addressed to a non-technical coach, one sentence).
- **Volatile user message** (~150 tokens, after the cache breakpoint): brand name, niche, chips, vibe, theme hex. Nothing dynamic (timestamps/IDs/tenant data) ever touches the prefix.
- **CI parity test:** asserts the prompt constant's embedded enums/font list equal `catalog.ts` + `logo_recipe.py` (the prompt is a new KEEP-IN-SYNC mirror). Runtime: log `usage.cache_read_input_tokens` per call to detect silent cache invalidation.

## 6. Structured output schema (Pydantic, Literal-constrained)

```python
class _Path(BaseModel):
    d: str
    fill: Literal["mark", "mark2", "accent"] = "mark"
    opacity: float | None = None
    fill_rule: Literal["nonzero", "evenodd"] | None = None

class _Mark(BaseModel):
    rationale: str          # ≤ ~140 chars, shown on the card
    paths: list[_Path]      # 2–6

class _Palette(BaseModel):
    name: str
    primary: str; secondary: str; accent: str; ink: str   # hex

class _BrandPack(BaseModel):
    marks: list[_Mark]          # exactly 3
    palettes: list[_Palette]    # exactly 3
    tagline: str
    font_vibe: Literal["Modern", "Elegant", "Bold", "Playful", "Minimal"]
```

## 7. Validation & security (server = trust boundary)

Recipes render inline for every student visitor and export to files — the validator is a stored-XSS-adjacent boundary:

- Every `d` must match whitelist `^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$` and be ≤2,000 chars; ≤8 paths per mark. This grammar cannot carry `url()`, markup, or external refs → no canvas taint in PNG export, no injection in SVG export.
- Every hex through the existing `_hex()` clamp; contrast check ink-vs-primary (substitute `#1a1a1a` on failure).
- A mark whose paths all fail **degrades to an initials mark** (clamp philosophy — the pack always yields renderable tiles); a pack with zero surviving AI marks is treated as `source:"error"`.
- **Injection parity fixtures are mandatory** in both `tests/test_logo_recipe.py` and `__tests__/migrate.test.ts`: `d` containing `url(`, `<script`, `javascript:` asserted dropped.
- **Dedicated per-project Anthropic API key** (past key-exposure incidents; one key per project/env), added to `.env.prod` via the standard secrets flow. `anthropic` returns to `requirements/base.txt`; `ANTHROPIC_API_KEY`, `LOGO_AI_MODEL`, `LOGO_AI_MONTHLY_BUDGET_USD` to `settings/base.py`.

## 8. Cost design

| Lever | Effect |
|---|---|
| One call → 9+ tiles multiplied client-side | Shuffle / More-like-this free forever (existing `moreLikeThis` gains a trivial `custom` branch that keeps the mark verbatim) |
| Fires only on explicit brief submit; never on shuffle | High-frequency actions cost $0 |
| Paid-tenant gate | Only revenue-generating tenants can spend |
| 5 packs/tenant/month, charged after success only | Hard per-tenant ceiling |
| 30-day versioned result cache | Re-opens/resubmits/demos free, quota untouched |
| Durable monthly USD kill-switch (DB row, charged every attempt, default $15) | Worst-case monthly bill is a config value; over budget → silent degrade to composer-only + warning log |
| `max_tokens=6000` cap + truncation salvage | No paid-but-wasted calls |
| Prompt caching on the static prefix | Free upside during bursts (not load-bearing; budget math assumes cold) |

**Per-pack math (cold cache, planning numbers):**
- **Sonnet 5** (intro $2/$10 per MTok through 2026-08-31): ~2,650 input + ~4,000–4,500 output (incl. adaptive thinking) ≈ **$0.05/pack** (≈$0.075 post-intro).
- **Haiku 4.5** ($1/$5): ≈ **$0.02/pack**.
- Worst case per tenant: 5 packs/month ≈ $0.25 (Sonnet) / $0.10 (Haiku).
- 100 active paid coaches all maxing quota: ≈ $25/Sonnet — but the $15 default kill-switch trips first; realistic onboarding usage (~2–3 packs/coach, once) is ~$10–15/month at 100 signups/month.

**Durable accounting:** one small shared-schema table, e.g. `LogoAiUsage(month, tenant_schema, packs_used, usd_spent)` — serves both the per-tenant quota and the global budget (cache used only as a hot-path read; Redis restarts must not reset billing state).

## 9. Schema, renderer & export changes

Three-way parity (KEEP-IN-SYNC headers + fixtures); all land in one change set, and `MARK_TYPES` must gain `"custom"` **before/with** any client emitting it (unknown enum = hard 400 on save):

1. **Backend `logo_recipe.py`:** `"custom"` added to `MARK_TYPES` (:18); new mark-dispatch branch validating `paths` (count/length/whitelist/opacity/fill-role clamps). `colors` dict gains optional `mark2`, `mark_accent` hex (via `_hex`, defaulting to `colors.mark`) — role tokens resolve against these at render, keeping raw hex out of mark internals.
2. **TS `types/logo.ts`:** `LogoMark` union += `{type:"custom"; rationale?: string; paths: {d; fill?; opacity?; fillRule?}[]}`. `migrate.ts` untouched (v1 never emitted custom); parity fixtures added to both suites.
3. **`composer.ts`:** `markKey()` gains a `custom` branch (hash of first `d`) — today unknown types collapse to `"image"`, silently corrupting wall dedupe. `moreLikeThis` gains a `custom` branch (mark + colors verbatim, layout/font/badge re-rolled). New `composeFromPack()`. `Brief` regains the `vibe` field. Stale "do not reintroduce" comments removed.
4. **Renderer `logo-renderer.tsx`:** one new `MarkContent` branch — `<g transform={scale(size/100)}>` with one `<path d fill={resolveRole(...)} fillRule fillOpacity>` per entry (mirrors `AbstractMark`). The single-renderer invariant propagates it to wall cards, canvas, previews, favicon, PNG export, and vector SVG export (paths pass through `svgWithTextPaths` verbatim = true vector for free). `name_only` favicon fallback (:594) must exclude `custom`.
5. **`brand-kit.ts` `darkVariant`:** extend `lighten()` to `colors.mark`/`mark2`/`mark_accent` when luminance < 0.4 — **blocking acceptance criterion** (otherwise dark-fill AI marks vanish on `logo-dark.svg/png`).
6. **Editor `studio-panel.tsx`:** swatch pickers bound to `colors.mark2`/`mark_accent` when the mark is custom (same binding pattern as `colors.mark`); mark section shows plain-language "AI-drawn mark" label with existing pickers offered as "Swap mark". **Palette-swap semantics defined:** applying a catalog palette to a custom-mark recipe derives `mark2 = lighten(palette.mark, 20%)` and `mark_accent = palette badge color` (deterministic; multi-color marks never silently collapse to monochrome).
7. **Satori `/pwa-icon`:** plain `<path>` is the safest shape for Satori's subset, but the pipeline has a known open bug — **pre-ship smoke test required**; if custom paths fail there, that surface alone falls back to the initials mark.

## 10. Coach-facing UX

- **Brief step:** the free-text vibe field returns ("Describe your vibe (optional) — e.g. calm, earthy, premium but approachable", max 200).
- **Ideas step:** deterministic 24-tile wall renders instantly, exactly as today — AI never gates or delays. For eligible paid coaches, submit auto-fires the pack request (that submit *is* the explicit gesture); a subtle header pill shows "Sketching custom marks for you…" with honest copy for a 15–40s wait. On success, a labeled row **"✦ Made for {brandName}"** is *prepended* above the grid (never replacing tiles the coach is looking at), each card with a sparkle "Custom" badge and its rationale as a muted caption. Stale responses dropped via the generation counter, including after the coach has moved into the editor.
- **Quota line, quietly:** "3 AI generations left this month."
- **Free-tier coaches:** locked upsell card in the same slot — "✨ AI logo designer — included with paid plans" → upgrade flow. No AI call is ever made.
- **Failure:** one muted inline line per the studio's existing pattern ("Couldn't reach the design studio just now — your ideas below are ready to use") + Retry; quota-exhausted shows "You've used this month's AI generations — tweak any idea below."
- **Editor:** AI recipes are ordinary recipes — drag/scale/recolor/typography/badge all unchanged; brand-kit zip exports true-vector SVG + dark variant. Re-opening the studio re-shows the last AI row from the result cache with zero calls. No JSON, no prompts, no model names anywhere in the UI.

## 11. Pre-ship gates & acceptance criteria

1. **Eval wall (go/no-go):** generate packs for ~20 real briefs with **both** Sonnet 5 and Haiku 4.5, rendered side by side; product owner reviews and picks the default `LOGO_AI_MODEL`. If neither model's marks beat the composer wall, the feature fails its premise and does not ship.
2. Injection parity fixtures green in both suites.
3. darkVariant lighten() covers the new color roles; dark brand-kit export visually verified with a custom mark.
4. Satori `/pwa-icon` smoke test with a custom mark (or initials fallback wired for that surface).
5. `markKey` custom branch + `MARK_TYPES` deploy-ordering respected; parity fixtures green.
6. Prompt-constant ↔ catalog CI test green; `cache_read_input_tokens` logged.
7. Gunicorn worker timeout verified ≥ 60s (else ship the Celery 202 variant).
8. Quota + budget accounting verified durable across container restarts; new cache keys covered by a dedicated conftest cleanup fixture (existing `ratelimit:*` purge doesn't match them).
9. Budget-trip emits a warning log (feature silently off must be noticeable to us, invisible to coaches).

## 12. Rollout

Ship dark (key unset = fully off, zero behavior change), then enable in prod with the dedicated key and `LOGO_AI_MODEL` per the eval outcome. Shared-working-tree caution applies: verify branch/HEAD before any commits.
