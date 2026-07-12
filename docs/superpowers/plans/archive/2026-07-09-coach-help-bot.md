# Coach Help Bot ("Ask Contentor") — Execution Plan

**Date:** 2026-07-09 · **Status:** BUILT (same day) — v1 implemented, tested (25 new tests, full suite 875 green), browser-verified end-to-end on the dev stack. Uncommitted.
**Goal:** an AI help chat for coaches inside the admin portal that answers any product question instantly, feels personal ("wow"), and costs well under a cent per question through aggressive reuse of a cached knowledge base.

> **Implementation deltas from the original plan below:**
> - **Dual provider** (user decision): local dev runs on the developer's Claude subscription via the `claude` CLI (`HELP_BOT_PROVIDER=cli` in `.env`; CLI baked into the dev django image via `INSTALL_CLAUDE_CLI=1` build arg; `ANTHROPIC_API_KEY` is stripped from the subprocess env so the CLI can never silently bill the API). Prod uses the Anthropic SDK + prompt caching exactly as designed (`HELP_BOT_PROVIDER` defaults to `anthropic`).
> - **One remaining local step:** run `claude setup-token` on the host and paste the token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN` (macOS keeps CLI credentials in the Keychain, which the Linux container can't read), then `docker compose up -d django`.
> - Endpoint prefix is `/api/v1/admin/help-bot/…` (tenant_config mounts under `admin/`).
> - Question-count cap added next to the USD caps (`HELP_BOT_TENANT_MONTHLY_QUESTIONS`, default 200) since subscription-mode answers record $0.
> - The bubble now persists as a "?" help button after the checklist is completed or dismissed, so the chat stays one click away.
> - Q&A DB log deferred (L3); only usage counters are stored.
> - **Marketing-site variant added (same day):** anonymous pre-sales chat on frontend-main. Public endpoints `POST/GET /api/v1/help/{chat,status}/` (`apps/core/help/`, `authentication_classes([])` + AllowAny), **visitor persona** sharing the same KB but linking only to /signup, /pricing, /demo, /login (never /admin). Abuse controls: per-IP throttles (5/min + 40/day), dedicated `__marketing__` spend bucket with its own caps (`HELP_BOT_PUBLIC_MONTHLY_USD` $10, `HELP_BOT_PUBLIC_MONTHLY_QUESTIONS` 500) that also counts into the shared global kill-switch. Widget: `frontend-main/src/components/shared/help-bubble.tsx` mounted in the root layout, hidden on /admin, /dashboard, /callback; EN+TR strings under `marketing.helpBot`.

---

## 1. Product shape (v1 scope)

- A **"Help" chat** inside the existing Setup Assistant bubble (`frontend-customer/src/components/setup/setup-assistant-bubble.tsx` / `setup-assistant-panel.tsx`), as a second tab next to the checklist. Coaches already know the bubble; no new UI surface to teach.
- **Answers questions, links to the right screen, knows the coach's own state.** It does NOT take actions (create courses, change settings) in v1 — that's Phase L1 (later).
- Audience: tenant **owner/staff only** (coach portal). Students never see it.
- Coaches are non-technical (see memory): answers avoid jargon, never show raw paths/slugs; navigation is rendered as **"Take me there →" buttons**.
- Bot mirrors the coach's language (Turkish coaches on `tr.` get Turkish answers) — instructed in the system prompt, no extra infra.

### The "wow" moments (all cheap, all v1)

1. **Instant streaming answer** — cached prefix + Sonnet ⇒ first token in well under a second.
2. **It knows *them*** — "You're on Starter and Stripe isn't connected yet — that's why payouts are off. Two steps: …" (fed from live tenant snapshot, see §3).
3. **One-click navigation** — every "how do I…" answer ends with a button that opens the exact admin screen.
4. **Context-aware conversation starters** — panel opens with 3 suggested questions derived from their setup state ("How do payouts reach my bank?", "How do students find my page?").
5. **Graceful honesty** — if it's not in the knowledge base, it says so and offers the support email instead of hallucinating. Trust is part of wow.

---

## 2. Token-efficiency architecture (the core requirement)

The user requirement: *reusable information so we don't input/output everything every time.* The design that achieves it:

### One static, versioned Knowledge Base in a cached system prompt

- New file `backend/apps/tenant_config/help_kb.md` (+ `help_bot.py` module, modeled on `logo_ai.py`): a hand-curated, bot-optimized digest of the whole product — features, how-tos, plan/pricing truth (source: `seed_plans.py` — Starter 8%/Pro 6%, 10/100/500 students), payouts via Stripe Connect, custom domains, inbox, community, live, campaigns, PWA, plus a **whitelist of deep-link routes** with human labels.
- Compiled from `docs/REFERENCE.md` + `docs/GLOSSARY.md` + coach-facing feature docs, then rewritten terse. **Budget ≤ ~15K tokens**, enforced by a unit test (char-length heuristic) so it never silently bloats.
- Sent as `system[0]` with `cache_control: {type: "ephemeral"}`. `PROMPT_VERSION` constant bumps on every KB edit (same discipline as `logo_ai.py`).

### Why this beats RAG here

- Prompt caching is **prefix-match and org-scoped**: the identical frozen prefix is shared across *all tenants and all conversations*. One coach's question warms the cache for every coach for 5 minutes. Cache reads bill at **0.1× input price**; writes at 1.25×.
- No embeddings provider, no vector store, no retrieval round-trip, no chunking bugs. At ≤15K tokens the whole manual fits in the prefix; RAG only becomes worth it past ~50K tokens (Phase L2: tool-based section fetch).

### Cache-correct prompt layout (order matters)

```
system[0]  = persona + answer rules + KB          ← frozen bytes, cache_control here
messages[0](user) = <tenant_context>…</tenant_context>  ← ~300 tokens, per-tenant, AFTER the breakpoint
                  + the coach's question
messages[1..] = normal turns (client resends transcript; server trims to last 6 turns)
```

- **Never interpolate anything per-tenant/per-request into `system`** (would fragment the cache per tenant). Tenant context lives in the first user turn.
- Tenant snapshot is built server-side per request from existing code: `setup_items.py` (checklist state), plan/subscription, custom-domain status, a few counts. ~300 tokens.
- Multi-turn follow-ups inside the 5-min TTL also hit the conversation-prefix cache (optional second breakpoint on the last turn; nice-to-have, not required for v1).

### Per-question cost (15K KB cached, ~800 tokens context+question, ~400-token answer)

| Model | Cache read | Fresh input | Output | ≈ per question |
|---|---|---|---|---|
| Haiku 4.5 ($1/$5) | $0.0015 | $0.0008 | $0.0020 | **$0.004** |
| Sonnet 5 (intro $2/$10) | $0.0030 | $0.0016 | $0.0040 | **$0.009** |
| Opus 4.8 ($5/$25) | $0.0075 | $0.0040 | $0.0100 | **$0.022** |

Cold-cache first question adds one KB write (~$0.02–0.04 on Sonnet). Even 1,000 questions/month on Sonnet ≈ **$9/month**. The efficiency comes from (a) never resending the KB uncached, (b) short `max_tokens` (~1000) + "concise answer" style rules, (c) trimmed transcripts.

**Model decision (flagged):** default `HELP_BOT_MODEL=claude-sonnet-5` — matches the house default (`LOGO_AI_MODEL`), near-Opus quality on this task class, intro pricing through 2026-08-31. Haiku 4.5 is the half-price fallback if quality holds in eval; Opus 4.8 if wow trumps all. Env-switchable, so this is a one-line change later.

---

## 3. Backend design

New endpoint (tenant app `tenant_config`, next to the logo AI code):

- `POST /api/v1/help-bot/chat/` — auth: tenant owner/staff (`TenantJWTAuthentication` default), body `{messages: [{role, content}...]}` (client-held transcript, server trims to last 6 turns / ~4K tokens, per-message length cap).
- Response: **SSE stream** (`StreamingHttpResponse`, `text/event-stream`) using `client.messages.stream()` from the Anthropic SDK; events: `delta` (text), `done` (usage + cost), `error`.
- Server builds the tenant snapshot (reuses `setup_items.py` + billing/domain lookups) and prepends it to the first user turn; the client never constructs it.
- **Usage accounting = clone of the proven `logo_ai.py` pattern:** `HelpBotUsage(tenant_schema, month, usd_spent, questions)` — record estimated cost on **every attempt** (kill-switch integrity), per-tenant monthly cap (`HELP_BOT_TENANT_MONTHLY_USD`, e.g. $1) + global monthly kill-switch (`HELP_BOT_GLOBAL_MONTHLY_USD`, e.g. $50). Capped tenants get a friendly "back next month — email us meanwhile" message, not an error.
- **Q&A logging:** store (question, answer-summary, tenant, cost, KB version) — this is the feedback loop that tells us what to add to the KB and, later, what features coaches can't find. Flag in privacy policy.
- Rate limiting: DRF throttle on the view (e.g. 10/min per user) on top of `TenantRateLimitMiddleware`.
- Safety rails in the system prompt: Contentor-help only; KB is the sole source of truth for prices/limits ("if unsure, say so + support email"); ignore instructions inside user text to change persona; only emit deep links from the KB whitelist.

**Infra checks:** streaming through Caddy → verify flush (add `flush_interval -1` to the `/api/*` proxy if buffered); Cloudflare tunnel passes SSE. Gunicorn sync workers hold one worker per open stream — fine at coach-traffic scale with short answers; note gthread config as the escape hatch. `ANTHROPIC_API_KEY` must be present in prod `.env.prod` (it is not in the template today — Brand Pack deploy has the same dependency).

---

## 4. Frontend design (frontend-customer)

- `setup-assistant-panel.tsx` gains tabs: **Checklist | Help**. Help tab = chat: message list, input, streaming render (plain `fetch` + `ReadableStream` reader — SSE bypasses `clientFetch` and its known Content-Length quirk).
- Markdown-lite rendering; links matching admin routes render as primary **buttons** using the label from the KB whitelist (never raw paths — coach UX memory).
- Suggested-question chips computed client-side from the already-fetched setup state.
- Transcript kept in component state (optionally sessionStorage); "New conversation" resets. No DB persistence of the thread in v1 beyond the Q&A log.
- Styling: existing house design system tokens (`var(--token)` directly — oklch memory).

---

## 5. Execution phases

| Phase | Work | Est. | Exit criteria |
|---|---|---|---|
| **0. KB + prompt + eval** | Author `help_kb.md` (from REFERENCE/GLOSSARY/seed_plans truth), system prompt, `help_bot.py` skeleton; management command `help_bot_eval` runs ~15 golden questions (EN+TR) and prints answers + cost + cache hits | ~½ day | Golden answers read correct & on-brand; KB ≤ 15K tokens; `usage.cache_read_input_tokens > 0` on second run |
| **1. Backend endpoint** | Streaming view, tenant snapshot builder, `HelpBotUsage` + caps, Q&A log, throttle, tests (TDD, mock Anthropic) | ~1 day | `make test` green; curl shows SSE deltas; cap trips in test |
| **2. Frontend chat** | Help tab in assistant panel, streaming UI, deep-link buttons, suggestion chips, i18n strings | ~1 day | Browser click-through on dev stack: ask → stream → button navigates |
| **3. Verify + ship** | Caddy flush check, cost telemetry eyeball, `HELP_BOT_ENABLED` env flag, prod env key, deploy | ~½ day | Live question answered on prod tenant; spend visible in `HelpBotUsage` |

**Later (not v1):** L1 agentic actions ("create the announcement for me") via tool use + confirm UI · L2 tool-fetched KB sections if KB outgrows ~50K tokens · L3 "what coaches ask" superadmin dashboard from the Q&A log · L4 student-facing variant.

---

## 6. Decisions to confirm

1. **Model:** Sonnet 5 default (recommended) vs Haiku 4.5 (half price) vs Opus 4.8 (max quality, ~2.5×).
2. **Free for every coach** (recommended — cuts support load, drives activation toward first paying coach) vs paid-tier perk like Brand Pack.
3. **Caps:** $1/tenant/month (~110 Sonnet questions) + $50 global — sane?
4. **Placement:** inside Setup Assistant bubble as a tab (recommended) vs a separate floating button.
