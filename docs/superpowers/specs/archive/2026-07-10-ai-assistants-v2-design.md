# AI Assistants v2 — Conversations, Takeover & Hardening — Design

**Date:** 2026-07-10 (amended 2026-07-11 — §17's badge question resolved as **D14**; see
`2026-07-11-ai-nav-grouping-and-blog-images-design.md` for the panel-nav and blog-image work
that shipped alongside it)
**Status:** Draft — pending owner review (see §2 for the veto list)
**Depends on:** AI assistants v1 (governance spec, `2026-07-10-ai-assistants-governance-design.md`) fully implemented — kernel (`apps/core/assistant.py`), three bots, `AiTranscript`, usage meters, platform KB, superadmin AI dashboard.

## 1. Problem

v1 shipped three working bots with governance. Six gaps keep them from being
a production support channel rather than a demo:

1. **Sessions are ephemeral.** `session_id` is a module-level UUID
   (`frontend-customer/src/lib/assistant.ts:27`, same pattern in
   `help-bot.ts` and frontend-main `HelpBubble`) — a page reload starts a
   new conversation, and the server never returns a thread. Coaches see a
   flat per-exchange transcript list, not conversations.
2. **No human escape hatch.** When the bot can't help, the student is
   stuck; the coach can watch transcripts after the fact but can never step
   in. Same for the platform: a coach struggling with "Ask Contentor" can't
   be rescued by the superadmin.
3. **Suggestions are static.** The student widget shows the coach's ≤3
   configured openers; the marketing widget hardcodes i18n suggestions.
   After the first answer there is nothing to tap — every follow-up must be
   typed.
4. **The bot is blind to the viewer.** `<student_context>` carries only
   `signed in: yes|no`, so the bot re-sells courses the student already
   owns and can't answer "where do I continue?".
5. **Links stop at the site edge.** The whitelist is builder pages +
   catalog URLs. Coaches can't point the bot at their Instagram, WhatsApp,
   or Calendly — the places where real coaching businesses actually convert.
6. **Abuse handling is incomplete for prod.** DRF anon throttles key on
   `REMOTE_ADDR`, which behind Cloudflare→tunnel→Caddy is not the client IP
   — per-IP limits currently bucket everyone together. There is no IP
   blocklist (manual or automatic), repeated identical questions each cost
   a model call, and a single session can burn its tenant's monthly quota
   in one sitting.

## 2. Decisions taken (owner: veto any of these at review)

Owner-approved during brainstorming (2026-07-10): **D1–D4**. The rest are
spec-level defaults, cheap to reverse before implementation:

- **D1 — Takeover transport is DB-backed polling.** New conversation +
  message tables; the student widget polls a thread endpoint every ~5s
  while the panel is open (3s in human mode). No GetStream, no websockets,
  no Django Channels: works for anonymous visitors, no third-party cost,
  no dev stubbing, 2–4s latency is fine for support chat.
- **D2 — Takeover semantics: pause AI + auto-release.** Takeover flips the
  conversation to `human`; the student sees a system line ("You're now
  chatting with {brand}"). The session persists in localStorage so a
  returning student sees coach replies. After 30 min without an agent
  message (`ASSISTANT_HUMAN_IDLE_RELEASE_MIN`), the conversation lazily
  auto-releases back to AI on the next touch; an explicit Release button
  also exists.
- **D3 — Viewer context = enrollments + purchases, titles only.** Enrolled
  course titles, owned download titles, active membership plan name,
  upcoming booked live sessions. Never names/emails, no progress %.
- **D4 — Coach link registry may include external https URLs.** The coach
  already controls every link on their own site; registry links are
  coach-self-owned risk. Students see external-link styling; validation
  stays exact-match client-side against a server-delivered whitelist.
- **D5 — session_id becomes a persistent client bearer token.** Stored in
  localStorage `{id, last_active}`, rotated after 24h idle. Knowing the
  UUID grants read access to that one conversation — the same trust class
  as a magic link. Poll endpoints are throttled; UUIDs come from
  `crypto.randomUUID()`.
- **D6 — Conversation scope.** All three bots write conversations.
  Takeover surfaces: coach console for `student_bot`; superadmin console
  for `help_bot` (both `coach` and `visitor`/marketing audiences). No
  coach takeover of marketing chats (not theirs), no superadmin takeover
  of student chats in v2 (tenant's business).
- **D7 — Human-mode messages are free.** They never touch the model, never
  accrue USD, never count against plan quotas. They get their own throttle
  scopes (they still write DB rows).
- **D8 — Signed-in conversations show the student's first name to the
  coach** (it is the coach's own student data; the v1 disclosure line
  already covers review). Anonymous conversations show "Visitor".
  `AiConversation` stores `user_id` + `user_label` for this.
- **D9 — "Talk to a human" notifies by email.** Student taps the button →
  `human_requested` + one email to the tenant owner (superadmin email for
  help-bot flavors). Without notification, takeover is a feature nobody
  discovers. Coach can disable the button per tenant
  (`AssistantConfig.human_handoff_enabled`, default True).
- **D10 — Answer cache serves free and doesn't count.** Exact repeat
  first-turn questions (keyed on prompt fingerprint incl. `kb_hash`) are
  served from cache: $0, no quota tick, transcript row with
  `provider="cache"` for audit.
- **D11 — Auto IP block: 5 throttled requests in 24h → 7-day block**,
  `source="auto"`, superadmin can lift; manual blocks via a writable
  adminkit registration. Applies to all public AI endpoints.
- **D12 — Follow-up suggestions are same-call.** Personas append a
  delimited JSON tail; the **kernel** strips it from the delta stream and
  emits `suggestions` in the `done` event. One implementation, all three
  widgets; ~50 extra output tokens per answer; malformed tail → no chips.
- **D13 — One `client_ip()` source of truth**, trusting `CF-Connecting-IP`
  (origin is reachable only through the Cloudflare tunnel, so the header
  is authoritative; dev falls back to `REMOTE_ADDR`). All AI anon
  throttles re-key onto it via a shared throttle base class.
- **D14 — Nav badge, resolving §17's open question (added 2026-07-11).**
  Email alone under-notifies — a coach or superadmin not actively watching
  their inbox misses the moment. Both consoles get a lightweight polling
  badge in addition to D9's email: a count endpoint
  (`human_requested=True AND status="ai"` — i.e. requested but not yet
  taken over; the badge clears once someone takes over, since they're now
  actively in it) polled by the nav shell every 45s. This is still D1's
  polling substrate, just a slower cadence for a background badge instead
  of an open conversation — no websockets, no push. See §5.4 and §6.5.

## 3. Approaches considered

1. **Extend the v1 kernel with a conversation layer** — new
   `AiConversation`/`AiMessage` beside `AiTranscript`, polling endpoints,
   kernel gains a tail-parser and message writes stay in the completion
   hook. **Recommended**: no live-table migrations, the SSE wire contract
   only gains fields, every piece lands in the modules that already own
   the behavior.
2. **GetStream Chat as the takeover substrate** — already a dependency
   (livestream panels use `stream-chat`). Rejected: anonymous visitors
   need token issuance, per-session channels cost money and quota,
   `LIVE_FAKE_ENABLED` stubbing would need a chat twin, and transcripts
   would live outside our audit tables.
3. **Fold takeover into the coach mailbox** — conversations become mailbox
   threads. Rejected: the mailbox is email-shaped (custom-domain-gated,
   minutes latency, compose semantics); chat takeover needs seconds
   latency and presence-ish state. The "email the coach" deep link remains
   the fallback for offline coaches.

## 4. Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │ apps/core/ai.py (unchanged provider layer)    │
                    └───────────────▲───────────────────────────────┘
                                    │
        ┌───────────────────────────┴──────────────────────────────┐
        │ apps/core/assistant.py — kernel v2                       │
        │ prepare_history · run_chat(+tail_parser → suggestions)   │
        │ log_transcript · NEW: conversation helpers               │
        │ (get_or_create_conversation, append_message,             │
        │  maybe_auto_release, thread_payload)                     │
        └───▲──────────────────▲──────────────────▲────────────────┘
            │                  │                  │
   help_bot.py            student_bot.py       apps/core/help/views.py
   (coach persona,        (student persona,    (marketing flavor)
    PROMPT_VERSION 3)      viewer context v2,
                           links, PROMPT_VERSION 2)
            │                  │
   NEW models (public, apps/core/models.py):
     AiConversation · AiMessage · AiIpBlock
   NEW model (tenant, apps/tenant_config/models.py):
     AssistantLink
```

Wire contract: SSE `delta/done/error` unchanged; `done` gains
`suggestions: [str]`. Human-mode sends return **JSON** (not SSE) —
widgets branch on `Content-Type`. New polling endpoints return plain JSON.

## 5. Conversation layer

### 5.1 Models (public schema, `apps/core/models.py`)

`AiConversation` — one row per session:

- `feature` (≤20, `help_bot|student_bot`), `audience` (≤10),
  `tenant_schema` (≤63, `__marketing__` for the public help bot),
  `session_id` (char 36, **unique**), `status` (≤8, `ai|human`,
  default `ai`)
- `agent_user_id` (int, null), `agent_label` (≤60, blank) — loose
  coupling like `tenant_schema`, no cross-schema FKs
- `user_id` (int, null), `user_label` (≤60, blank) — D8; set on the first
  authenticated exchange
- `human_requested` (bool), `human_requested_at` (null)
- `taken_over_at`, `last_user_message_at`, `last_agent_message_at` (all
  null), `created_at`, `updated_at`
- Indexes: `(feature, tenant_schema, updated_at)`, `(status)`;
  `session_id` unique.

`AiMessage` — the thread:

- `conversation` FK (CASCADE), `role` (≤10,
  `user|assistant|agent|system`), `content` (Text, ≤8000 truncated),
  `transcript_id` (int, null — links assistant messages to their
  `AiTranscript` audit row), `created_at`
- Index `(conversation, id)`.

`AiTranscript` is **unchanged** (quota/audit write path untouched).
Retention: `purge_ai_transcripts` extends to delete `AiConversation`
rows (messages cascade) with `updated_at` older than
`AI_TRANSCRIPT_RETENTION_DAYS` — one retention knob for all chat data.

### 5.2 Kernel additions (`apps/core/assistant.py`)

- `get_or_create_conversation(*, feature, audience, tenant_schema,
  session_id, user=None)` — creates on first message; stamps
  `user_id`/`user_label` (first name only) when an authenticated user
  appears. Invalid/blank session_id → conversation still created with a
  server-generated UUID returned in `done` (defensive; normal clients
  always send one).
- `append_message(conversation, role, content, transcript_id=None)` —
  also bumps the relevant `last_*_at` + `updated_at`.
- `maybe_auto_release(conversation)` — if `status == "human"` and
  `last_agent_message_at` (or `taken_over_at`) is older than
  `ASSISTANT_HUMAN_IDLE_RELEASE_MIN`, flip to `ai` and append a system
  message `assistant_resumed`. Called lazily from chat + thread views —
  no new celery job.
- `thread_payload(conversation, after_id=0)` → `{status, agent_label,
  human_requested, messages: [{id, role, content, created_at}]}` —
  incremental via `after_id`.
- Existing on_complete hooks in both bots additionally write the
  `user` + `assistant` message pair (assistant message carries
  `transcript_id`). Message writes are best-effort like `log_transcript` —
  never break the stream.

### 5.3 Client session persistence

All three widget libs replace the module-level UUID with a localStorage
record (`contentor.ai.session.<feature>` on the relevant origin):
`{id, last_active}`; rotate when `last_active` > 24h old; update
`last_active` on every send. On panel open, hydrate local message state
from the thread endpoint (replacing the client-only history); the chat
POST still sends the trimmed `messages` array — the server-side thread is
storage/takeover truth, the wire history contract is unchanged.

### 5.4 Thread endpoints (polling)

| Endpoint | Auth | Serves |
|---|---|---|
| `GET /api/v1/assistant/thread/?session=<uuid>&after=<id>` | public (tenant host), session-bearer | student widget |
| `GET /api/v1/admin/help-bot/thread/?session=&after=` | IsCoachOrOwner | coach HelpChat |
| `GET /api/v1/help/thread/?session=&after=` | public (marketing host), session-bearer | HelpBubble |
| `GET /api/v1/admin/assistant/conversations/needs-human-count/` | IsCoachOrOwner | coach nav badge (D14) |
| `GET /api/v1/platform/ai-conversations/needs-human-count/` | IsSuperUser | superadmin nav badge (D14) |

The two count endpoints return `{"count": n}` — `human_requested=True AND
status="ai"`, scoped `feature="student_bot", tenant_schema=<own>` (coach)
or all `feature="help_bot"` conversations (superadmin, both audiences).
Polled every 45s by the nav shell, independent of whether the
Conversations tab/section is open — a much lighter cadence than the
5s/3s thread polling since it's a background badge, not a live view.

Each validates the conversation's `feature` + `tenant_schema` match the
serving context (mismatch or unknown session → 404, and the widget just
shows an empty thread). Poll cadence: 5s while the panel is open, 3s when
`status == "human"` or `human_requested`; stop when closed. New generous
throttle scopes `ai_thread: 30/min` (per-IP via D13) keep this honest.

## 6. Human takeover

### 6.1 State machine

```
        takeover (coach/superadmin)
   ai ────────────────────────────────► human
   ▲                                      │
   │   release (explicit)                 │
   ├──────────────────────────────────────┤
   │   auto-release (30 min agent idle,   │
   └───────────────── lazy) ◄─────────────┘
```

Every transition appends a `system` message (`agent_joined {label}`,
`agent_left`, `assistant_resumed`) so both the student thread and the
audit trail show exactly who was speaking when.

### 6.2 Chat-path behavior in human mode

`assistant_chat` / `help_bot_chat` / `help_bot_public_chat` resolve the
conversation first (after `maybe_auto_release`):

- `status == "human"` → store `AiMessage(role="user")`, bump timestamps,
  return `200 JSON {"mode": "human"}` — **no model call, no quota, no
  USD** (D7). The widget renders the sent message and keeps polling.
- `status == "ai"` → exactly today's SSE path (gating → throttles → caps →
  stream), plus message writes in the hook.

Quota/budget exhaustion (`quota`/`budget` reasons) no longer dead-ends the
student: the widget shows the existing unavailable line **plus** the
"Talk to a human" button when handoff is enabled — human mode works even
when the AI is capped (it costs nothing).

### 6.3 Coach console (student_bot)

`/admin/assistant` gains a **Conversations** tab (replacing the
TranscriptsCard UI; the v1 transcripts endpoint remains for API
compatibility but the card is retired):

- List: `GET /api/v1/admin/assistant/conversations/?page=N&status=` —
  ordered by `-updated_at`; each row: user_label/"Visitor", feature
  badge, last message snippet, message count, `human_requested` badge,
  live status. The list view polls every 10s while visible.
- Thread: `GET /api/v1/admin/assistant/conversations/<id>/thread/?after=`
  — coach console polls at 3s while a thread is open.
- `POST .../<id>/takeover/` → status=human, `agent_label` = coach first
  name (fallback "Coach"); 409 if already human.
- `POST .../<id>/message/` `{content ≤2000}` → `AiMessage(agent)`;
  requires `status == "human"` (403 otherwise).
- `POST .../<id>/release/` → back to `ai`.
- "Add to knowledge" moves onto assistant messages in the thread view
  (same prefill wiring as v1).

All `IsCoachOrOwner`, scoped `feature="student_bot"`,
`tenant_schema=<own>`. Throttle: coach message sends reuse the `help_bot`
user scope (10/min).

### 6.4 Superadmin console (help_bot)

Platform endpoints (`apps/core/platform/`, `IsSuperUser`), same four
verbs under `GET/POST /api/v1/platform/ai-conversations/…`, filterable by
`audience` (`coach|visitor`) and `tenant_schema`. Frontend:
`frontend-main/src/app/admin/ai/page.tsx` gains a Conversations section
(table + thread drawer + takeover controls). `agent_label` = "Contentor
support". The coach HelpChat and marketing HelpBubble widgets gain the
same poll/human-mode handling as the student widget (shared logic where
the libs allow).

### 6.5 "Talk to a human" (D9)

- Widget button under the input. Student flavor: shown when
  `AssistantConfig.human_handoff_enabled` (new bool, default True) — the
  status endpoint exposes it. Coach-help and marketing flavors: always on
  (the superadmin owns that console; no per-tenant switch).
- `POST /api/v1/assistant/human-request/` `{session_id}` (and help-bot
  equivalents): sets `human_requested(_at)`, appends a system message,
  sends **one** email — tenant owner for student_bot (existing
  transactional email path, e.g. the magic-link sender), superadmin
  address (`HELP_BOT_ALERT_EMAIL`, default `DEFAULT_FROM_EMAIL`) for
  help_bot. Idempotent per conversation (repeat taps don't re-email);
  throttle `ai_human_request: 2/hour` per IP.
- Email copy: "{label} asked to talk to a human on {site}" + deep link to
  the conversation in the right console. Non-technical copy
  (coach-non-technical-UX rule).

## 7. Dynamic follow-up suggestions (D12)

- Persona addition (all three, verbatim contract):

  ```
  After your answer, output on a new line exactly:
  |||SUGGESTIONS ["q1","q2"]
  2–3 short follow-up questions (≤60 chars each) the user would
  plausibly ask next, in the user's language. Nothing after this line.
  ```

- `run_chat` gains `tail_delimiter="|||SUGGESTIONS"` handling: it holds
  back a small rolling buffer (delimiter length − 1 chars) so a delimiter
  split across deltas is caught, stops emitting deltas once the delimiter
  starts, and on completion parses the JSON array → `done` event gains
  `suggestions` (validated: list of ≤3 strings, each trimmed to ≤80
  chars). The accumulated `answer` passed to `on_complete` (→ transcript,
  → `AiMessage`) has the tail stripped. Malformed/absent tail → clean
  answer, empty suggestions, no error.
- Widgets render the chips under the latest assistant message (replacing
  any previous chips); tapping sends the text. The static opener chips
  (config `suggested_questions`, marketing i18n) remain for the empty
  state only.
- `PROMPT_VERSION`: help_bot 2→3, student_bot 1→2.
  `STUDENT_BOT_MAX_OUTPUT_TOKENS` 600→700 so the tail isn't truncated on
  long answers (truncated tail degrades gracefully to no chips).
- Preview chat gets suggestions too (free QA of the contract).

## 8. Viewer-aware context (D3)

`student_bot.build_viewer_context(user)` extends the first-turn
`<student_context>` block for authenticated students:

```
<student_context>
signed in: yes
enrolled courses: Yoga Basics; Advanced Flow   (≤10 titles)
owned downloads: Meal Plan PDF                 (≤10 titles)
membership: Pro Monthly                        (active plan name or none)
upcoming live sessions: Breathwork — 2026-07-14 (≤5)
</student_context>
```

- Titles only — no names, emails, prices, or progress (PII rule).
- Sources: `Enrollment` (courses), `PaymentItem` generic-FK ownership
  (downloads and paid live sessions — there is no booking model), and
  `Subscription` (membership plan name); each is one capped query.
- Persona additions: "If student_context lists owned items, don't re-sell
  them — help the person use them (point to /dashboard or the item's
  page)." Context lives in the user turn, so the per-tenant system prompt
  stays byte-stable and Anthropic-cache-warm.
- Anonymous viewers keep the v1 one-liner.

## 9. Coach link registry (D4)

New tenant model `AssistantLink` (`apps/tenant_config/models.py`):
`label` (≤60), `url` (≤500 — either a same-site path starting `/` or an
absolute `https://` URL; any other scheme rejected at validation),
`note` (≤160, "when to offer this"), `enabled` (default True),
`position`, timestamps. `MAX_LINKS = 20` (validated at create).

- Knowledge pack gains a `LINKS` section:
  `- {label}: {url} — {note}` (enabled only, ordered by position). Persona
  whitelist rule extends: "…or a LINKS entry. Never any other external
  URL."
- `GET /api/v1/assistant/status/` gains
  `link_whitelist: [url, …]` (enabled registry URLs). Widgets keep hard
  client-side validation: same-origin paths as today, plus **exact-match**
  against the whitelist for absolute URLs — rendered as
  `<a target="_blank" rel="noopener noreferrer">` with external-link
  styling. `parseAnswer` (admin transcript/thread rendering) applies the
  same rule.
- Coach UI: a Links card on `/admin/assistant` (CRUD, enable toggles,
  drag-free position field).
- CRUD endpoints mirror the knowledge ones:
  `GET/POST /api/v1/admin/assistant/links/`,
  `PATCH/DELETE /api/v1/admin/assistant/links/<pk>/` (IsCoachOrOwner).

## 10. Production hardening

### 10.1 `client_ip()` + re-keyed throttles (D13)

- `apps/core/net.py`: `client_ip(request)` — `CF-Connecting-IP` if
  present, else first `X-Forwarded-For` hop, else `REMOTE_ADDR`. Safe
  because prod origin is only reachable through the Cloudflare tunnel
  (no published ports — header can't be spoofed end-to-end); dev hits
  `REMOTE_ADDR`.
- New base class `ClientIpAnonThrottle(AnonRateThrottle)` overriding
  `get_ident()`; all AI anon throttles (help public, student bot, rate,
  new thread/human-request scopes) move onto it. This fixes the latent
  everyone-shares-one-bucket bug in prod.

### 10.2 IP blocklist (D11)

- Public model `AiIpBlock`: `ip` (GenericIPAddressField, unique),
  `reason` (≤200), `source` (`manual|auto`), `expires_at` (null = forever),
  `created_at`. Writable adminkit registration on `platform_site`
  (PlatformKbEntry pattern — second writable AI model).
- Enforcement: `reject_blocked_ip(request)` guard at the top of every
  public AI view (chat, thread, human-request, rate, status) → `403
  {"detail": "blocked"}`. Active-block set cached 60s (Redis) so the guard
  is one cache hit per request.
- **Auto-block**: the shared throttle base counts denials per IP in Redis
  (`24h` TTL); at `AI_IP_AUTOBLOCK_THRESHOLD` (5) it creates
  `AiIpBlock(source="auto", expires_at=now+AI_IP_AUTOBLOCK_DAYS (7))`.
  Superadmin lifts blocks by deleting the row.

### 10.3 Answer cache (D10)

- Key: `sha256(feature | audience | prompt_version | kb_fingerprint |
  normalized_question)` where `kb_fingerprint` = `kb_hash` (student) or
  the addenda fingerprint (help), and normalization =
  casefold + whitespace-collapse. **Only** consulted when the history is
  a single user message (first turn — later turns depend on history).
- Hit: replay `delta` + `done` frames from the cached
  `{answer, suggestions}`; transcript row written with
  `provider="cache"`, `cost_usd=0`; **no** question count, **no** USD
  accrual. Miss: normal path, then populate. TTL
  `AI_ANSWER_CACHE_TTL` (24h, Redis default cache). `kb_hash` in the key
  self-invalidates on any content change.

### 10.4 Session + conversation caps

- Per-session daily question cap: Redis counter
  `(session_id, date)` against `ASSISTANT_SESSION_DAILY_QUESTIONS` (40);
  over → non-stream `{enabled: false, reason: "session_limit"}`, widget
  shows a friendly "come back tomorrow or contact {brand}" line (with the
  human-request button when enabled). Prevents one visitor draining a
  tenant's monthly quota; human-mode messages are exempt (already free)
  but get their own scope `ai_human_message: 20/min`.
- Existing v1 caps (tenant USD, tenant questions, global USD kill-switch,
  DRF scopes) all remain; suggestion-tail tokens are inside the recorded
  cost.

### 10.5 What we deliberately do NOT add

No ML off-topic pre-classifier: a haiku classification call costs the
same order as just answering (~$0.003), and the persona already refuses
off-topic. The junk-question defenses are the free ones: throttles,
session caps, the answer cache, and IP blocks.

## 11. Settings (new, `config/settings/base.py`)

```
--- AI assistants v2 ---
ASSISTANT_HUMAN_IDLE_RELEASE_MIN = 30
ASSISTANT_SESSION_DAILY_QUESTIONS = 40
AI_ANSWER_CACHE_TTL = 60 * 60 * 24
AI_IP_AUTOBLOCK_THRESHOLD = 5
AI_IP_AUTOBLOCK_DAYS = 7
HELP_BOT_ALERT_EMAIL = ""          # falls back to RESEND_FROM_EMAIL
STUDENT_BOT_MAX_OUTPUT_TOKENS = 700  # was 600 (suggestion tail headroom)
```

New throttle scopes: `ai_thread: 30/min`, `ai_human_request: 2/hour`,
`ai_human_message: 20/min` (all per-client-IP via D13).

## 12. Frontend changes summary

| Surface | Changes |
|---|---|
| `SiteAssistantBubble` (frontend-customer) | persistent session (localStorage, 24h rotation), thread hydration on open, 5s/3s polling, human-mode send path + system lines, "Talk to a human" button, follow-up chips, external-link rendering via `link_whitelist` |
| Coach `/admin/assistant` | Conversations tab (list + thread + takeover/message/release, replaces TranscriptsCard), Links card, preview chat renders suggestion chips |
| Coach `HelpChat` (frontend-customer setup panel) | persistent session, polling, human-mode handling (superadmin takeover), chips |
| `HelpBubble` (frontend-main) | same as HelpChat, against `/api/v1/help/*` |
| Superadmin `/admin/ai` (frontend-main) | Conversations section: table (audience/tenant filters), thread drawer, takeover controls |
| Coach + superadmin nav shells | D14 badge: poll `needs-human-count` every 45s, red count badge on the AI nav group, links through to the Conversations view pre-filtered to `human_requested` |

Strings in the existing i18n files (EN + TR). The three widget libs share
the polling/human-mode state machine shape; frontend-main necessarily gets
its own copy (separate app), kept intentionally small.

## 13. Guardrail invariants (delta to the v1 table)

| Invariant | Mechanism (v2) |
|---|---|
| Human-mode containment | `status=human` short-circuits before any model call; human messages can never trigger AI spend |
| Takeover authorization | coach endpoints `IsCoachOrOwner` + own-schema + `feature=student_bot`; superadmin `IsSuperUser`; students/visitors can never write `agent` messages |
| Session bearer scope | session UUID grants exactly one conversation, feature+tenant validated per request; 404 on mismatch; thread scope throttled; UUIDs unguessable (`crypto.randomUUID`) |
| Cache poisoning | cache key covers feature, audience, prompt_version, full KB fingerprint, normalized question; first-turn only; cached rows audited (`provider="cache"`) |
| IP abuse | `client_ip()` single source (CF header, tunnel-only origin); blocklist checked before throttles; auto-block with expiry; manual superadmin CRUD |
| Link containment (extended) | whitelist = pages + catalog + coach registry (https-only, exact match, server-delivered); client-side hard validation unchanged; external links `rel="noopener noreferrer"` |
| Suggestion injection | tail parsed as strict JSON, length/count clamped, rendered as text-only chips (never links/HTML) |
| PII (extended) | viewer context = titles only; `user_label` = first name, shown only to the owning coach; conversations purged with transcripts on one retention knob |

## 14. Testing

TDD throughout; suites extend the v1 files:

- **Kernel v2**: tail parser (delimiter split across deltas, malformed
  JSON, missing tail, answer stripped in on_complete); conversation
  helpers (create/get, user stamping, auto-release boundary at exactly
  30 min, system messages, best-effort writes never raise).
- **Chat human mode**: human status → JSON response, message stored, no
  usage accrual, no transcript; auto-release flips then streams; capped
  tenant (quota/budget) can still use human mode.
- **Thread endpoints**: incremental `after`, wrong tenant/feature/session
  → 404, throttle scope applied, payload shape.
- **Takeover endpoints**: permission matrix (student 401/403, other
  tenant's coach 404, superadmin on platform routes), 409 double-takeover,
  message requires human status, release semantics.
- **Human request**: idempotent email (exactly one), flag set, throttle,
  disabled-flag hides and rejects.
- **Viewer context**: owned items listed with caps, titles only (assert
  no email/name), anonymous unchanged, byte-stable system prompt.
- **Links**: scheme validation (`javascript:`/`http:` rejected), cap 20,
  pack section rendering, `link_whitelist` in status, `parseAnswer`
  exact-match behavior (unit, frontend).
- **Hardening**: `client_ip` header precedence; blocked IP → 403 on every
  public AI view; auto-block at threshold with expiry honored; cache
  hit = zero cost + no quota tick + audit row; cache key changes with
  kb_hash; session daily cap → `session_limit`.
- **Frontends**: vitest for the widget state machine (hydration, polling
  transitions ai↔human, chips replace, external-link rendering); e2e
  capstone: student asks → coach takes over from Conversations tab →
  student sees coach reply via poll → release → AI answers again; second
  spec: superadmin takes over a coach help chat.
- Purge test covers conversations + messages.
- **Badge (D14)**: `needs-human-count` reflects only `human_requested=True
  AND status="ai"` (excludes already-taken-over and never-requested
  conversations), scoped per-tenant (coach) / per-audience (superadmin),
  clears immediately on takeover.

## 15. Rollout (each phase independently shippable, in order)

1. **Conversation substrate** — models, kernel helpers, message writes
   from both bots' hooks, persistent client sessions, thread endpoints +
   widget hydration/polling (read-only: still pure-AI behavior), purge
   extension.
2. **Coach Conversations tab** — list/thread UI replacing transcripts
   card ("Add to knowledge" preserved).
3. **Takeover, student side** — state machine, coach
   takeover/message/release, human-mode chat path, system lines,
   human-request + email, widget human-mode UX, coach nav badge (D14).
4. **Superadmin console** — platform conversation endpoints + `/admin/ai`
   section, HelpChat + HelpBubble human-mode support, superadmin nav
   badge (D14).
5. **Answer quality** — kernel tail parser + suggestions (all widgets),
   viewer context, link registry + Links card.
6. **Hardening** — `client_ip` + throttle re-key, `AiIpBlock` +
   auto-block + adminkit registration, answer cache, session caps.

Phases 5 and 6 are independent of 2–4 and can be reordered if takeover
review takes longer.

## 16. Non-goals (v2)

- No websockets/Channels/GetStream for takeover; no typing indicators,
  read receipts, presence dots, or unread counters.
- No agent assignment/routing (any coach seat can take over; the tenant
  has effectively one coach).
- No push notifications for takeover (email only; the PWA push stack is
  on an unmerged branch).
- No ML off-topic classifier or content moderation pass (§10.5).
- No canned replies / saved responses for agents.
- No conversation export, search, or CRM linkage.
- No cross-device student session continuity (session is per-browser by
  design — it's a bearer token).
- No coach takeover of marketing chats; no superadmin takeover of student
  chats (D6).
- No per-coach control of suggestion behavior (on for everyone; the tail
  costs ~$0.0002/answer).

## 17. Open questions (only if the owner wants to change a default)

- Auto-release window: is 30 min right? (Shorter risks yanking an active
  human chat; longer leaves students waiting on a gone coach.)
- `ASSISTANT_SESSION_DAILY_QUESTIONS = 40` — generous vs. Pro's 1500/mo
  tenant quota; tune freely, it's a setting.
- D8 first-name display — comfortable, or keep everyone "Visitor"/
  "Student"?
- ~~Should the coach get a nav badge (polling count) for `human_requested`
  conversations, or is the email enough for v2?~~ **Resolved 2026-07-11 —
  D14: yes, badge + email.**
