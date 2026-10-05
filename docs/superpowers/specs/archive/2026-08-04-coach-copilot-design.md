# Coach Copilot — design

**Date:** 2026-08-04
**Status:** approved (this doc), plan pending
**Supersedes:** the `/admin/site-ai` panel UX (`2026-07-26-p2-2-admin-site-ai.md` plan's frontend surface). The compose engine and trust boundary it built are reused, not replaced.

## Vision

A floating AI assistant on the coach's own site that is their absolute helper: it answers any question, asks clarifying questions when genuinely unsure, and can *do* things — change design, add/change/remove page elements, create a course, create an event. The coach can click any visible element on any page to hand it to the assistant as context.

User-facing name: **"Your AI assistant"** (EN) / **"Yapay zekâ asistanınız"** (TR). Internal name: **copilot** (avoids collision with the visitor-facing "Site assistant" and the admin "Ask Contentor" help chat).

## Decisions (settled with the owner)

1. **Surface:** floating bubble on *every* page of the tenant site, coach-only — not confined to `/?edit=1` edit mode or the admin SPA.
2. **Selection:** *anything visible* is clickable. Selections that map to a builder block carry the block id; anything else carries a best-effort description and the AI negotiates ("that's a course card — I can retitle the course, want that?").
3. **Conversation:** the model asks clarifying questions only when genuinely unsure. **No hard ask-cap this iteration** — steering is prompt-level ("prefer acting once intent is clear"). If it over-asks in practice, a superadmin-configurable cap is the Phase 3 knob (adminkit-registered platform setting).
4. **Metering: none for the coach.** No quota checks, no upsell states, no credits. The platform-global monthly USD kill-switch stays as a silent wallet backstop; when tripped the widget says the assistant is resting — never "upgrade". `PlatformPlan.max_site_ai_updates` stays in the schema but nothing consumes it (revisit later).
5. **Old panel:** `/admin/site-ai` becomes a one-button launcher that deep-links to the tenant site with the widget open (`/?copilot=1`). Its form/quota UI and the `site_ai_admin` preview/apply endpoints are retired.

## Architecture: an action-based agent

Per coach message the model returns a **structured union** (pydantic-validated via `apps/core/ai.py`, same as every AI feature):

```
{ kind: "answer", text }                      — conversational reply
{ kind: "ask",    text }                      — clarifying question (uncapped; prompt steers toward acting)
{ kind: "actions", note?, actions: [Action] } — one or more typed proposals
```

**Nothing executes without a tap.** Every action renders as a confirmation card in the chat (with a human-readable preview); a separate execute call runs it after the coach confirms. The AI has broad *proposal* power and zero *unconfirmed write* power — the same trust model as the old preview→apply, extended to everything.

### Action registry

| Action | Phase | Executes via | Preview card |
|---|---|---|---|
| `edit_pages` | 1 | `ai_compose.compose_pages` + existing whitelist/caps/sanitization, diffed with `site_ai.diff_pages` | before → after field rows |
| `add_block` | 1 | new pure helpers over `cfg.pages` using a fixed template registry derived from `compose.py`'s block builders; AI supplies type, position (page + after-block-id), content fields validated against the same field caps | "Add a testimonials section to Home after the intro" + field values |
| `remove_block` / `move_block` | 1 | pure helpers over `cfg.pages`, by block id | "Remove the FAQ from Pricing" |
| `create_course` | 2 | the server path `wizard_create_course` mirrors (admin serializers), created as **draft** | title, outline, price |
| `create_event` | 2 | `LiveClassCreateSerializer` / `OnsiteEventCreateSerializer`, draft | kind, title, date |
| `create_blog_post` | 2 | blog admin create path, draft | title, summary |
| `edit_theme` / `edit_navbar` | 3 | narrow `TenantConfig` fields (theme id from the catalog, navbar layout/cta) | "Switch to Midnight theme" |

Adding a power later = adding a registry entry + executor + card renderer; the union and transport never change.

### Backend (`backend/apps/core/copilot/`)

New package, coach-JWT (`IsCoachOrOwner`), mounted at `/api/v1/admin/copilot/`:

- `POST converse/` — SSE (`EventStreamRenderer` + `stream_response`, like `site_ai_admin` did). Body: `{transcript, selections, message}`. Server is **stateless**: the transcript travels with each request (the `logo_converse` pattern). Emits `phase` frames then one `done` frame carrying the union. `edit_pages` proposals embed the diff rows; block/content proposals embed their param summary. Each proposed action gets a server-minted signed `action_token` (payload = action JSON + tenant schema, short TTL) so execute can't be forged or replayed cross-tenant.
- `POST execute/` — body `{action_token}`. Verifies, executes via the registry, returns a result card payload (e.g. created-course URL, or "applied — 4 fields changed"). Idempotent per token (single-use).
- Gate: reuse `ai_compose.compose_available()` (flag + provider + global monthly budget). When false, `converse/` answers a plain JSON refusal the client renders as the "resting" state.
- Cost accounting: every model call still `record_spend`s into the onboarding meter (kill-switch integrity, per existing convention). No `record_update`, no availability checks.
- Prompting: system prompt is a module-level constant (byte-identical across tenants, prompt-cache rule); tenant context (brand, niche, current pages digest, selections, transcript) rides in the user turn via a `CoachBrief`-style builder.

### Selection payload

```
{ path: "/pricing", block_id: "blk_faq" | null, tag: "h3", role: null,
  text: "≤200 chars of innerText", context: "≤120 chars of parent text" }
```

Public block wrappers get stamped with `data-block-id` (small renderer change in the public page renderer) so clicks inside builder blocks resolve to an editable block. Everything else sends the descriptive fields and lets the model reason.

### Widget (frontend-customer)

- `components/copilot/` — floating bubble + chat panel, rendered from the public tenant layout only when the stored coach JWT is present and role-checked (server re-verifies every call; the client check is only visibility). `?copilot=1` opens it on load (the admin launcher's deep link).
- Selection mode: document-level capture-phase click/hover interceptor; hover outlines via a single absolutely-positioned ring element (no per-node listeners); Esc or a second toggle exits. Selected elements become removable context chips above the input.
- Cards: answer bubbles, ask bubbles (with quick-reply), action cards with Confirm/Dismiss, result cards. `edit_pages` cards reuse the existing before→after row rendering.
- Streaming via the existing `streamAi` client; conversation state (transcript, chips) lives in component state — a page navigation clears it (v1; persistence is a later nicety).
- Loading/feedback conventions per root CLAUDE.md (useAsyncAction, no raw spinners, sonner toasts for execute results).

### What gets retired

- `/admin/site-ai` page form → launcher button (nav item stays, copy updated).
- `backend/apps/core/site_ai_admin.py` endpoints + urls (panel-only consumers). `site_ai.py`'s engine functions (`preview_edit`, `apply_edit`, `diff_pages`) stay — the copilot's `edit_pages` executor uses them. The wizard reveal chat is untouched.
- e2e `28-admin-site-ai.spec.ts` → replaced by a copilot spec (stubbed SSE, same approach).

## Error handling

- Model failure / budget trip mid-conversation → SSE `error` frame → chat renders a retryable "that didn't work" bubble; never a dead widget.
- Execute failures return structured errors rendered in the card (e.g. serializer validation); the proposal stays so the coach can retry or rephrase.
- Action tokens: expired → card offers "re-propose"; tampered/cross-tenant → 403, logged.

## Testing

- **Backend:** pytest per concern — union parsing/validation, action token sign/verify/single-use, each executor (block add/remove/move as pure-function tests; edit_pages threading; course/event creation against real serializers), kill-switch refusal.
- **Frontend:** lib-level tests for selection payload building and transcript reduction (repo convention: lib-only, no React harness).
- **e2e:** one spec driving the widget with a stubbed SSE conversation: open → select → ask-turn → action card → confirm → result. Plus the launcher deep link.

## Phasing

1. **Phase 1 — copilot core + design powers:** package, converse/execute, widget, selection overlay, `edit_pages` + `add_block`/`remove_block`/`move_block`, panel→launcher, retire old endpoints. Independently shippable; delivers the original ask.
2. **Phase 2 — content powers:** `create_course`, `create_event`, `create_blog_post` (draft-only creates).
3. **Phase 3 — chrome + knowledge:** `edit_theme`/`edit_navbar`, ground answers in the platform KB (fold in Ask Contentor's knowledge for "how do I get paid?"-class questions), and a superadmin-configurable ask-cap platform setting (adminkit) if the uncapped conversation over-asks in practice.
