# AI-guided onboarding — design

Date: 2026-10-05 · Status: approved in conversation, awaiting spec review

## Intent

One onboarding, in one place, that a coach does not leave until their site is
live. An AI interviewer leads it: one natural, sensible question at a time,
built on what the coach just said, so it feels like expert guidance — "wow,
that's amazing guidance". When it ends, the site is published with every
detail it needs. Use AI wherever it helps.

**Owner's words → decisions (2026-10-05)**

| Topic | Decision |
|---|---|
| AI engine | Free Gemini container (`AI_PROVIDER=agentc`) for everything — interview turns, mic correction, page builds, drafts. Measured ~6.5 s per interview turn in dev. |
| Finish line | Site **published**. Stripe payouts required only if the coach sells paid content. |
| Look & logo | AI proposes, coach taps (style cards, logo shortlist) inside the conversation. |
| Layout | Conversation first, full width; once enough is known the chat slides to the side and the live site builds beside it. |
| Paid plan | Chosen at go-live, after the coach has seen the whole site. |
| Interviewer | Brief-driven: AI extracts facts and asks the next question; code owns completeness and every trigger. |

## Today (being replaced)

Two flows:

1. **frontend-main signup wizard** — brand → name+email → verify link →
   niche → describe → ≤2 AI follow-ups → goals → style → logo → custom domain
   → review → `wizard_finalize` → `provision_tenant` → handoff to the tenant.
2. **Tenant `/setup`** — first course / live class / article drafts
   (`ContentQuestion`) → six page steps → payouts → launch, with a side
   `ChatPanel` copilot.

## 1. One place: signup → instant site → `/setup`

- **Signup is unchanged up to the verify link** (`frontend-main/src/app/signup/signup-form.tsx`, `creator_signup` in `backend/apps/core/onboarding/views.py`).
- **Verify provisions immediately.** `creator_signup_verify` already creates the `Tenant` + `Domain` rows; it now also enqueues `provision_tenant` with an empty brief (niche `general`). Provisioning on the styled path makes no AI calls (schema, config, owner user, `setup_flow` init). It must **not** enqueue `compose_site_task` — pages build per milestone (§3).
- **The verify page** (`frontend-main/src/app/signup/verify/page.tsx`) shows "Preparing your space…", polls `GET /api/v1/onboarding/status/`, then calls `onboarding_handoff` (already returns `…/callback?token=…&next=/setup`). That hop happens before the first question; after it the coach stays in `/setup`.
- **Gate:** unchanged mechanism (`frontend-customer/src/app/setup/gate.ts`, `setup_flow_active` in `tenant_config/serializers.py`). `/admin` and the public site redirect to `/setup` while `setup_flow.status == "active"`; `/setup` redirects to `/admin` once done.
- **Resume:** the brief and the conversation are server-side; reopening `/setup` restores both.
- **Slug** stays fixed from the brand name at signup (no rename path exists after provisioning). The display brand name may still change via copilot.
- **Custom domain purchase** leaves onboarding; it stays in the admin (`/api/v1/domains/`).
- **Existing tenants with an active `setup_flow`** get their brief pre-filled from `wizard_state.answers` (niche, description, followups, goals, style, logo) and the interviewer asks only what is missing.

### Deleted

- frontend-main wizard: `frontend-main/src/app/signup/verify/wizard/*`, `frontend-main/src/lib/wizard/*` (machine, types, themes) and their tests.
- Backend wizard endpoints: `wizard_state`, `wizard_catalog_view`, `wizard_finalize`, `wizard_checkout`, `wizard_checkout_sync`, `wizard_site_edit_preview/apply` (`apps/core/onboarding/wizard.py`), `wizard_followups.py`, `wizard_logo.py`, `apps/domains/wizard_views.py`, `experiments.py`/`wizard_bucket` usage. Keep whatever the new flow still imports (e.g. `wizard_catalog.recommended_style`, niche list) — move those helpers, don't duplicate them.
- `/setup` `ContentQuestion` and the fixed step rail as the driver (the rail may remain as a read-only progress view if it still reads well).
- Abandoned-wizard recovery (`apps/core/onboarding/recovery.py`) is **retargeted**, not deleted: "you left your setup halfway" email linking to `/setup`, keyed on the last interview turn time.

## 2. The brief and the interview turn

### Brief fields

Stored in `Tenant.wizard_state.answers` (the place every consumer already
reads), validated by a pydantic `Brief` model that replaces
`wizard_catalog.validate_answers`. Each field is `empty`, `answered`, or
`delegated` ("you decide" — filled with a sensible default at build time).

| Group | Field | Required when |
|---|---|---|
| Who | `teaches` (free text) + `niche` (mapped to `available_niches()`, `general` fallback) | always |
| Who | `pitch` (one line) | always |
| Students | `audience` | always |
| Students | `outcome` (the change students get) | always |
| Students | `difference` (what makes the approach theirs) | always |
| Story | `story`, `credentials` — only what the coach said; never invented | always (delegated = About page uses a neutral, claim-free story) |
| Offers | `offers` ⊆ {course, live, onsite, articles, community, memberships} → also written to `goals` | always |
| Offers | `sells` (free / paid) | always |
| First course | `course.topic`, `course.format` (length/lessons), `course.level`, `course.price` | `course` ∈ offers |
| Live | `live.topic`, `live.when` (weekday + time, tenant tz), `live.duration`, `live.price` | `live` or `onsite` ∈ offers |
| Article | `article.topic` | `articles` ∈ offers |
| Voice | `tone` | always |
| Look | `style`, `logo` (existing `{mode, curated_id, …}` shape) | always (answered by tapping a card) |
| Contact | `contact` (email / Instagram / WhatsApp), `location` if onsite | always |

Priority order = table order. Required set is recomputed from the answers on
every turn.

### Turn endpoint

`POST /api/v1/admin/setup-flow/turn/` · JWT, `IsCoachOrOwner`, per-tenant throttle.

Request: `{message: str ≤2000, spoken: bool, choice?: {field, value}}`
(`choice` = a tapped chip or card; applied directly, no extraction needed,
but still followed by an AI call for the next question).

One `core_ai.structured` call (`apps/core/ai.py:160`, label
`contentor:interview`, foreground priority) with the brief, the last ~20
turns and the message. Output model:

```python
class InterviewTurn(BaseModel):
    heard: str | None          # spoken=True only: corrected transcript (brand, niche vocabulary)
    facts: list[Fact]          # {field, value}; code validates each, drops invalid
    edit_request: str | None   # a change to the site → copilot
    ack: str                   # one short line reflecting what they said
    next_field: str            # must be a currently-missing required field
    question: str              # one question, in their words' context
    options: list[str]         # 0–4 suggested answers
```

Interviewer rules (system prompt, modelled on the brainstorming skill): one
question per turn; multiple choice when possible; never ask for a known fact;
never two questions at once; short; warm; refer back to what they said; never
invent facts about the coach.

Code after the call:

1. Validate and merge `facts` (and `choice`); store `heard` as the displayed coach text.
2. If `edit_request`: run `copilot.engine.run_turn` and auto-execute its action cards the way `ChatPanel` does today (`runBundle`, undo kept); include the result in the response.
3. If `next_field` is not a missing required field, use the first missing one in priority order (keep the AI's question only if it was for that field).
4. Fire milestones (§3).
5. Append to `setup_flow.interview.turns` (capped), save, return.

**Fallback:** on `AiError`, timeout, or `compose_available()` false, code
returns a pre-written question + options for the top missing field
(`INTERVIEW_FALLBACKS`, one entry per field). Free text in fallback mode is
stored verbatim into that field. The flow never errors or stalls.

Response: `{coach_text, ack, question, options, field, can_delegate, edit?, milestones_fired[], remaining, state}` where `remaining` = count of missing required fields and `state` = the existing `state_body` (page_builds, content, publish_blockers…).

### Feeding existing consumers

`ai_curate.CoachBrief.from_tenant` (`ai_curate.py:35`) and
`site_composer._coach_data` (`site_composer.py:802`) read the new fields
through one adapter: `description` ← pitch + teaches; `followups` ← the other
answered fields as labelled `{q, a}` facts (cap raised from 4 to fit the brief);
`goals` ← offers. Copilot, drafts (`setup_flow._draft_user_turn`), photo picks
and logo ranking then work unchanged.

## 3. Screen and milestones

**Phase 1 — getting to know you.** Full-width conversation in the `/setup`
shell tokens. Each AI message = ack + question + chips (tap sends) + "You
decide" chip; input box with mic. During a turn: the coach's bubble appears
immediately, then `<Spinner>` + "Thinking…". A quiet "about N questions left"
from `remaining`.

**Phase 2 — the site builds beside the chat.** When the Home facts are
complete the chat slides into the side panel and `BrowserFrame` appears.

Page builds use the existing per-page path (`start_page_build` →
`compose_page_task`), each fired **once**, when its facts exist:

| Page | Fires when answered/delegated |
|---|---|
| home | teaches, pitch, audience, outcome, offers |
| about | + story, credentials, tone |
| courses | + first course draft exists |
| contact | + contact |
| faq | + offers, sells, prices |
| pricing | only if `memberships` ∈ offers and a plan exists |

Style is applied from the AI's pick as soon as Home fires (so Home builds in
it); tapping the alternative style card re-fires the built pages with
`force=True`.

When a page lands (`page_builds` → ready) the next turn's ack points at it
("Your About page is up — I led with your 12 years of teaching") with "Looks
great" / "Change something" chips. No per-page approval clicks.

**Look cards** (rendered in the chat from the turn response):
- Style: 2 cards — `recommended_style(niche)` + the next enabled style.
- Logo: 3 curated cards + wordmark, from `ai_curate.rank_logos` (today Celery-only while `pending` — run it post-provision once `teaches`/`audience` are known, store in `wizard_state.curated_logo_rank`); "Show me others" pages by 3; "Design my own" opens the existing Logo Studio in an overlay inside `/setup` (`embed=1`).

**Content drafts:** when `course.*` is complete → `setup_flow.create_draft("course", prompt)` with a prompt built from the brief; same for live (`event`) and article (`post`). Shown in the preview; the AI invites changes.

**Mobile:** chat full screen; "See your site" flips to the preview (existing `MobileHeader`).

## 4. Go-live, money, mic

**Go-live** fires when no required field is missing, every applicable page is
ready and the drafts exist. The AI says the site is ready and shows a **Go
live** card summarising pages, the course and price, the live class time.

1. **Plan** — only if `sells == paid` and the plan is free. Card with the real Starter price (`platform/plans/`). "Choose Starter" → `POST /api/v1/billing/platform/checkout/` with a new optional `return_path` restricted to `/setup` (mirror `connect_onboard`'s check in `billing/views/connect.py:35`); today it always returns to `/admin/billing`. Cancel → AI offers "Make it free and go live now" (sets `sells=free`, course pricing to free) or "Try again".
2. **Payouts** — only if selling. Existing `connect_onboard` with `return_path=/setup`. Fix: the card refreshes Stripe status only on `?connect=return`, which the `/setup` return never carries (`payouts-card.tsx:50`) — make the return path carry it. Same "make it free" escape.
3. **Publish** — existing `finish` + `publish=True`. A 400 `publish_requirements_unmet` turns into a plain-words AI message plus the one question that clears it. Then the existing `Celebration`, `setup_flow.status = done`, land in `/admin`.

**Mic** (`frontend-customer/src/components/copilot/mic-button.tsx`, shipped 2026-10-05):
- `interimResults = true` so words appear while the coach speaks.
- A message dictated through the mic is sent with `spoken: true`; the turn returns `heard`, the corrected transcript, which replaces the coach's bubble and is what facts are extracted from. No separate call, no added wait. Firefox: no mic (unchanged).
- Admin copilot composer keeps the plain browser mic.

## 5. Testing and rollout

**Backend (pytest, fake `structured`)**
- Turn: invalid facts dropped; wrong `next_field` → priority fallback; `AiError` → pre-written question; required set follows offers; `heard` stored for spoken messages; `choice` applied without extraction; `edit_request` reaches the copilot.
- Milestones: each page build fires exactly once when its facts complete; course draft fires on completion; style switch re-fires built pages.
- Adapter: composer/copilot/draft inputs contain the new facts.
- Signup: verify enqueues provisioning without `compose_site_task`; handoff lands on `/setup`.
- Money: checkout `return_path` accepted only for `/setup`; "make it free" clears the `payouts` blocker.
- Existing `tenant_config/tests/test_setup_flow.py` updated, not dropped.

**E2E**
- New spec replacing `01-signup-onboarding`: signup → verify → interview → publish, with AI off so `INTERVIEW_FALLBACKS` drive it deterministically.
- Delete `23-wizard-ai-logo`, `27-wizard-domain-purchase`; retarget `19-wizard-recovery`; update `e2e/impact-map.json`; remove `e2e/helpers/holdout.ts`.

**Quality (manual)** — walk the real flow against the container as 2–3
coaches (yoga, chess, makeup); share transcripts with the owner; tune the
interviewer prompt from them.

**Rollout** — one branch, committed per phase: (1) mic tweaks, (2) brief +
turn endpoint + milestones, (3) `/setup` UI, (4) signup cutover + wizard
deletion + recovery retarget. Prod prerequisite (never done): `secrets.sh set
contentor AI_PROVIDER agentc`, `AGENTC_HUB=http://agent-container-hub:39300`,
prod compose joins `agent-container_default`. Then `make deploy` and verify on
prod.

## Risks

- **6.5 s per turn** feels slow if the questions are weak; the quality pass is where this is won or lost. If turns regularly exceed ~10 s, the switch to the paid Gemini API is a provider setting, not a redesign.
- **Container contention:** page builds (background priority) and interview turns (foreground) share the hub; interview turns must not queue behind builds.
- **Provisioning at verify** creates schemas for coaches who never continue; the existing abandoned-tenant cleanup (`test_abandoned_cleanup`) must cover provisioned-but-unfinished tenants.
