# Shared AI Provider Layer — Design

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Problem

Every AI feature must be runnable in local dev on the developer's Claude
subscription (via the `claude` CLI) instead of the metered Anthropic API key,
so development never burns API tokens. Today that guarantee is partial and
duplicated:

| Feature | Module | CLI provider today |
|---|---|---|
| Help bot (coach + visitor chat) | `apps/tenant_config/help_bot.py` | yes (`HELP_BOT_PROVIDER=cli`) |
| Blog AI (topics + posts) | `apps/blog/ai.py` | yes (`BLOG_AI_PROVIDER=cli`) |
| Logo Studio Brand Pack | `apps/tenant_config/logo_ai.py` | **no — dev always bills the API key** |
| Flowmap (dev tool) | `tools/flowmap/` | already `claude -p`; out of scope |

Concrete pains:

1. **Brand Pack burns real tokens in dev** — the one feature without a CLI path.
2. **The CLI provider is implemented twice** (`help_bot._stream_cli`,
   `blog._cli_structured`) with six per-feature env vars
   (`HELP_BOT_PROVIDER`, `HELP_BOT_CLI_BIN`, `HELP_BOT_CLI_MODEL`,
   `BLOG_AI_PROVIDER`, `BLOG_AI_CLI_BIN`, `BLOG_AI_CLI_MODEL`); every new AI
   feature re-implements the subprocess handling and adds more switches.
3. **Failures are silent-ish**: with the providers set to `cli` but
   `CLAUDE_CODE_OAUTH_TOKEN` empty (the exact state found 2026-07-09), the
   bot just fails with no precise reason surfaced.
4. Incidental smells: `_estimate_cost` lives in `logo_ai` and is imported by
   `blog` and `help_bot` (wrong dependency direction); `blog.generate_post`
   carries provider-conditional logic just to record which model ran.

## Goal

One shared provider layer in `apps/core`, one `AI_PROVIDER` env switch, all
three features migrated, CLI-for-dev mandatory for future AI features, and a
one-command health check (`make ai-check`). Prod behavior is byte-identical
to today.

## Design

### 1. New module: `apps/core/ai.py`

Plain functions (matching the codebase's functional style), two call shapes —
the only two that exist in the codebase:

```python
class AiError(Exception):
    """Provider failed before or during a call. Carries cost_usd (Decimal,
    default 0) so callers can accrue kill-switch spend for billed failures."""

def stream_text(*, system: str, history: list[dict], model: str, max_tokens: int):
    """Generator. Yields ("delta", str) events, then exactly one
    ("done", {"cost_usd": Decimal, "provider": str, "model": str}).
    Raises AiError on provider failure."""

def structured(*, system: str, user: str, output_model: type[BaseModel],
               model: str, max_tokens: int):
    """One blocking structured-output call.
    Returns (parsed: output_model, cost_usd: Decimal, effective_model: str).
    Raises AiError on provider failure or schema-validation failure."""

def available() -> tuple[bool, str]:
    """Provider preflight. Reasons:
    ok | no_api_key (anthropic) | cli_no_binary | cli_no_token (cli)."""

def estimate_cost(usage, model) -> Decimal:
    """Anthropic usage -> USD. Moves here from logo_ai (with _MODEL_PRICES);
    logo_ai/blog/help_bot import it from core.ai."""
```

Notes:

- `model` is always the caller's choice (per-feature model settings stay);
  the provider decides what it means: anthropic uses it verbatim, cli
  ignores it in favor of `AI_CLI_MODEL`. The **effective** model used is
  returned (`"model"` key / third tuple element) so callers like
  `blog.generate_post` can record `ai_model` without provider conditionals.
- `available()` checking `cli_no_token` (empty `CLAUDE_CODE_OAUTH_TOKEN`
  while `AI_PROVIDER=cli`) is new — it turns the silent dead-bot failure
  mode into a precise reason. Features that surface availability
  (`help_bot.availability`, `blog.availability`, brand-pack status) map any
  non-ok reason to their existing `"disabled"` state, so no API contract
  changes.

### 2. Provider implementations (private to `core/ai.py`)

**anthropic** (prod, and any env that should bill the key):

- `stream_text`: SDK `client.messages.stream`, system block sent with
  `cache_control: {"type": "ephemeral"}` (today's
  `help_bot._stream_anthropic`, verbatim).
- `structured`: SDK `client.messages.parse` with `output_format=output_model`
  and the same cached system block (today's `blog._anthropic_structured` /
  `logo_ai.generate_brand_pack` call).
- Client: `timeout=100.0, max_retries=1` (the more generous of the two
  existing configs, needed by the slowest call — brand pack at 6000 tokens).
- Cost via `estimate_cost(response.usage, model)`.

**cli** (local dev on the developer's subscription):

- `stream_text`: `claude -p <prompt> --model $AI_CLI_MODEL --system-prompt
  <system> --disallowedTools "*" --max-turns 1 --output-format stream-json
  --include-partial-messages --verbose`, parsing `stream_event` /
  `content_block_delta` / `text_delta` lines (today's
  `help_bot._stream_cli`, verbatim). History is serialized by the current
  `help_bot._cli_prompt` logic (prior turns wrapped in
  `<conversation_so_far>`, last user message verbatim), which moves here.
- `structured`: blocking `claude -p ... --output-format json` with the
  `output_model.model_json_schema()` appended to the system prompt as a
  "respond with ONLY a JSON object" contract; strip code fences; validate
  with the SAME pydantic model as the anthropic path (today's
  `blog._cli_structured`). `max_tokens` is accepted but unused —
  the CLI has no such control; the schema + prompt bound the output.
  On JSON/schema-validation failure the call is retried ONCE before raising
  `AiError` — schema-in-prompt has no parse forcing, so occasional invalid
  JSON is expected (observed in the field 2026-07-09: blog draft with a JSON
  syntax error at col 587, fine on retry). Retries are dev-only by nature
  (cli provider) and cost nothing on the subscription.
- Timeout: 120 s (`CLI_TIMEOUT_SECONDS`, moves here).
- **Billing protection (invariant):** `ANTHROPIC_API_KEY` and
  `ANTHROPIC_AUTH_TOKEN` are stripped from the subprocess env so the CLI can
  never silently bill the API key instead of the subscription.
- **Cost is `Decimal("0")` (invariant):** subscription usage never accrues
  against the USD budget caps.
- Subprocess runs with `cwd=tempfile.gettempdir()`, fixed argv, no shell.

**Prompt-caching contract (unchanged, restated because the shared layer must
enforce the temptation away):** the `system` argument must be byte-frozen
per feature — persona/KB/static prompt only. Tenant state travels in the
user turn. Never interpolate per-tenant data into `system`; it fragments the
Anthropic cache per tenant.

### 3. Settings

In `config/settings/base.py`, replacing the per-feature provider vars:

```python
# --- AI provider (apps.core.ai) ---
# "anthropic" (prod: API key + prompt caching) or "cli" (local dev: the
# developer's Claude subscription via the `claude` CLI; needs the binary in
# the container — dev compose builds with INSTALL_CLAUDE_CLI=1 — and
# CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
AI_PROVIDER = os.environ.get("AI_PROVIDER", "anthropic")
AI_CLI_BIN = os.environ.get("AI_CLI_BIN", "claude")
# Dev default is haiku: local runs test plumbing/UI, not output quality, and
# it's faster + lighter on the developer's subscription quota. Set
# AI_CLI_MODEL=sonnet when a dev session needs prod-quality output (e.g.
# eyeballing brand-pack SVGs or blog copy).
AI_CLI_MODEL = os.environ.get("AI_CLI_MODEL", "haiku")
```

Removed: `HELP_BOT_PROVIDER`, `HELP_BOT_CLI_BIN`, `HELP_BOT_CLI_MODEL`,
`BLOG_AI_PROVIDER`, `BLOG_AI_CLI_BIN`, `BLOG_AI_CLI_MODEL`.

Kept (feature concerns, not provider concerns): `ANTHROPIC_API_KEY`,
`HELP_BOT_MODEL`, `BLOG_AI_MODEL`, `BLOG_AI_TOPIC_MODEL`, `LOGO_AI_MODEL`,
and every budget/quota var.

**Prod guard:** `config/settings/prod.py` raises `ImproperlyConfigured` if
`AI_PROVIDER == "cli"`. The CLI path must never run in production (no binary
in the prod image — `INSTALL_CLAUDE_CLI` stays dev-only — and a $0-cost
provider would blind the kill-switches).

**Env file changes:** dev `.env` replaces `HELP_BOT_PROVIDER=cli` +
`BLOG_AI_PROVIDER=cli` with `AI_PROVIDER=cli`; `.env.prod` /
`.env.prod.example` need no change (default is `anthropic`), but the example
gains the commented new vars for documentation.

### 4. Feature migrations

Per-feature usage accounting (`HelpBotUsage`, `BlogAiUsage`, `LogoAiUsage`),
budgets, quotas, personas, prompts, validation, and view/API contracts are
all untouched. Only the provider plumbing changes:

- **`help_bot.py`** — delete `_stream_anthropic`, `_stream_cli`,
  `_cli_prompt`; `stream_answer` becomes a thin call to
  `core.ai.stream_text(system=system_prompt(audience), history=history,
  model=settings.HELP_BOT_MODEL, max_tokens=MAX_OUTPUT_TOKENS)`, catching
  `AiError` → `HelpBotError`. `availability()` replaces its inline
  provider checks with `core.ai.available()`.
- **`blog/ai.py`** — delete `_anthropic_structured`, `_cli_structured`;
  `_call_structured` becomes a thin call to `core.ai.structured(...)`
  (model chosen by the caller: `BLOG_AI_MODEL` for drafts,
  `BLOG_AI_TOPIC_MODEL` for topics), catching `AiError` → `BlogAiError`
  (preserving `cost_usd` carry-through). `generate_post` records the
  returned effective model as `ai_model`. `_provider_configured()` uses
  `core.ai.available()`.
- **`logo_ai.py`** — `generate_brand_pack` calls `core.ai.structured(
  system=STATIC_PROMPT, user=user_content, output_model=_BrandPack,
  model=settings.LOGO_AI_MODEL, max_tokens=6000)` — **gaining the CLI
  provider**. `AiError` → `BrandPackError` with cost carried. The brand-pack
  availability/status endpoint uses `core.ai.available()`.
  `_estimate_cost` + `_MODEL_PRICES` move to `core/ai.py` as
  `estimate_cost`; after the migration no feature module computes cost
  itself (the layer returns it), so the old imports of
  `logo_ai._estimate_cost` in `blog/ai.py` and `help_bot.py` are simply
  deleted, not redirected.

### 5. Dev ergonomics: `make ai-check`

New management command `python manage.py ai_check` (in `apps.core`), wired
as `make ai-check`:

1. Print `AI_PROVIDER`, and for cli: binary path found (or not) and whether
   `CLAUDE_CODE_OAUTH_TOKEN` is set; for anthropic: whether
   `ANTHROPIC_API_KEY` is set. This is `core.ai.available()` verbatim.
2. On preflight failure, print the fix: e.g. *"run `claude setup-token` on
   the host, put the token in .env as CLAUDE_CODE_OAUTH_TOKEN, then restart
   django + celery-worker"*.
3. On preflight success, fire one tiny end-to-end `structured` call
   (trivial one-field schema, ~10 output tokens) and report ok/fail with
   the effective model. With `AI_PROVIDER=anthropic` this bills a fraction
   of a cent and says so; it never runs implicitly.

Exit code 0 only if the end-to-end call succeeds, so it can gate scripts.

### 6. Testing

- **New `apps/core/tests/test_ai.py`:** provider selection via
  `AI_PROVIDER`; `available()` reasons including `cli_no_token`;
  subprocess env lacks `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`
  (asserted on the popen/run call); stream-json event parsing → deltas +
  done; structured JSON extraction incl. code-fence stripping and
  schema-validation failure → `AiError`; CLI cost is `Decimal("0")`;
  anthropic paths mocked at the SDK client.
- **Existing feature tests** (`test_help_bot.py`, blog AI tests,
  `test_logo_ai.py`) migrate their mock points from the deleted private
  functions to `core.ai.stream_text` / `core.ai.structured`; every current
  behavior contract (SSE event shapes, availability reasons, quota/budget
  accrual on attempt vs success) must stay green unchanged.
- **New:** brand pack via CLI provider returns a validated pack (mocked
  subprocess); prod-settings guard raises on `AI_PROVIDER=cli`.
- `ai_check` command: unit-tested with mocked provider (no real calls in CI).

### 7. Rollout

1. Land the layer + migrations + tests (single branch, one plan).
2. Update dev `.env` (`AI_PROVIDER=cli`, drop the two old provider vars) —
   `CLAUDE_CODE_OAUTH_TOKEN` must be filled once via `claude setup-token`
   (user step, pending as of 2026-07-09).
3. `make ai-check`, then exercise help bot, blog generation, and brand pack
   in the browser on the CLI provider.
4. Prod deploy needs no env change; `AI_PROVIDER` defaults to `anthropic`.

## Non-goals

- No new AI features; no prompt, budget, quota, or API-contract changes.
- No frontend changes.
- Flowmap stays as-is (already subscription-based via `claude -p`).
- No per-feature provider override (one global switch; add later if a real
  need appears).
- No third provider / no LLM-router library.
