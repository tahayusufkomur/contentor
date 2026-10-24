# Setup as a Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/setup` a short presentation by the creator's team. Before each new concept, its specialist presents one slide. Build-status lines are signed by whoever does the work, and going live hands the coach over to their six specialists.

**Architecture:** A code-owned slide catalogue (`interview_slides.py`) decides which slides are due before the live question. They are attached to the guide the way `cards` are (never stored in the transcript), and recorded as seen or skipped in `setup_flow["interview"]["slides"]`. Examples for each coach are written once, by a background AI call fired as a setup milestone, with a field-neutral fallback. The client shows the due slides in place of the question until each one is passed. The hand-off lines ride on `golive_state` and reach the `Celebration` screen through the publish callback.

**Tech Stack:** Django 5.1 + django-tenants (tenant-schema `TenantConfig.setup_flow` JSON), Celery, `apps.core.ai.structured`, Next.js 14 (`frontend-customer`), next-intl messages, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-setup-storytelling-design.md`

## Global Constraints

- No turn may wait on slide content: the examples are written by a Celery task, never on `run_turn`'s path (anti-goal, S10).
- The background AI call uses label `contentor:setup-slides`, added to `_AGENTC_BACKGROUND_LABELS` in `backend/apps/core/ai.py`, so it never takes the coach's interactive hub slot.
- Words rule: copy shown to the creator never says teacher, coach or instructor, and never asks what they "teach". Terms are the glossary's: course, module, lesson, membership, way in, live class, in-person event, articles, community, payouts.
- No line promises something the platform can't do today. Every factual claim in a slide or hand-off line is checked against the code in the step that writes it (S5, anti-goal).
- Specialist names, jobs, colours and icons come from `team.py` / `lib/copilot/team.ts` / `messages/en/admin.json` `team.specialists.*`, never retyped in setup code.
- Setup shell tokens only (`--sf-*` from `setup-flow/tokens.ts`). Motion is CSS-only and `motion-safe:`. Async buttons use `<Button loading>` and `useAsyncAction`. Internal links use `<NavLink>`. Enforced by `make lint`.
- `OPENING_ACK` says "about 18 minutes" (S3).
- Slides are full width of the guide section. They work at phone width, and Enter or → is Next.
- Backend tests run from an agent shell as `docker compose exec -T django pytest <path> -n auto`; `make test-app` needs a TTY.

## Review Focus

1. **Answered in passing.** The coach types "face yoga courses and live classes for busy mums" at the first question, which settles `offers` and `audience`, so `offers` is never asked. The ways-to-work slide must still show, before the next question (Task 1: `test_slide_for_a_field_answered_in_passing_shows_before_the_next_question`).
2. **Reload mid-deck.** The coach reloads with two slides due and one passed. Only the unpassed slide shows, and nothing shows twice (Task 2: `test_state_serves_only_unrecorded_slides`).
3. **Setups already under way at deploy.** A tester sitting at `pitch` gets no opening, site or ways slides, but does get the pitch slide and the later ones (Task 2: `test_baseline_migration_skips_slides_behind_the_asked_field`).
4. **Examples missing or malformed.** The AI is down, or returns 2 students instead of 3. Slides render the fallback with the brand name, and no crash (Task 3: `test_examples_fall_back_when_missing_or_short`).
5. **A skipped section.** "No course for now" means no course slide and no ways-in slide for the course (Task 1: `test_skipped_section_takes_its_slides`).

## Calls this plan makes beyond the spec

- **Where the examples are stored.** In `setup_flow["interview"]["slide_examples"]` (tenant schema, next to the slide records), not in the answers. The answers live in the public `Tenant.wizard_state` and feed the composer; slide examples are not facts about the creator.
- **The look slide's picture.** The static sketch in two palettes, which is the spec's own fallback. The upgrade path is the coach's home page in two looks.
- **Slide 13 (payouts).** A Financial Strategist byline and lead on the existing payouts card, not a slide in the deck: go-live has no question screen to put it in front of.
- **Setups already under way (S15).** A one-off data migration writes `slides_from`, so the runtime rule needs no special case for them.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/apps/tenant_config/interview_slides.py` (new) | The slide catalogue, which slides are due, rendering a slide with examples or the fallback, recording, writing the examples |
| `backend/apps/tenant_config/interview_team.py` (new) | The hand-off lines for go-live |
| `backend/apps/tenant_config/migrations/0036_setup_slides_baseline.py` (new) | Marks where slides start for setups already under way (S15) |
| `backend/apps/tenant_config/interview.py` | Attach slides to the guide; signed `started_note`; `OPENING_ACK` |
| `backend/apps/tenant_config/interview_milestones.py` | `slides:examples` milestone |
| `backend/apps/tenant_config/interview_golive.py` | `team` in `golive_state` |
| `backend/apps/tenant_config/setup_flow_views.py`, `urls.py` | `POST setup-flow/slide/` |
| `backend/apps/core/tasks.py`, `backend/apps/core/ai.py` | `write_setup_slides` task; background label |
| `frontend-customer/src/lib/setup-flow.ts` | Types (`Slide`, `TeamLine`, `status_by`), `api.slide`, `GoLiveState.team` |
| `frontend-customer/src/components/setup-flow/concept-slides.tsx` (new) | The slide deck shown before a question |
| `frontend-customer/src/components/setup-flow/slide-pictures.tsx` (new) | One picture per slide key |
| `frontend-customer/src/components/setup-flow/setup-flow.tsx`, `question-screen.tsx`, `launch.tsx`, `payouts-card.tsx`, `go-live-card.tsx`, `golive-panel.tsx`, `mock.ts` | Wiring |
| `frontend-customer/src/components/copilot/specialist-face.tsx` | `size="lg"` |
| `e2e/specs/01-signup-onboarding.spec.ts`, `e2e/impact-map.json` | Walk through slides; new label |

---

### Task 1: Slide catalogue and which slides are due

**Files:**
- Create: `backend/apps/tenant_config/interview_slides.py`
- Test: `backend/apps/tenant_config/tests/test_interview_slides.py`

**Interfaces:**
- Produces:
  - `Slide` (frozen dataclass): `key: str`, `by: str` (a `team.KEYS` key), `fields: tuple[str, ...]` (trigger fields; the first one currently required is the trigger), `chapter: str`, `title: str`, `body: str`, `next: str`.
  - `SLIDES: tuple[Slide, ...]` in the order below.
  - `SLIDE_BY_KEY: dict[str, Slide]`.
  - `due(next_field: str | None, answers: dict, record: dict, slides_from: str | None) -> list[Slide]`.
  - `render(slides: list[Slide], answers: dict, examples: dict | None, record: dict, brand: str) -> list[dict]`. Each dict is `{"key", "by", "first": bool, "chapter", "title", "body", "next", "picture": dict}`.
  - `END = "__end__"`.

The catalogue. Titles, bodies and Next labels are the fallback copy, written in code as given here. `{brand}` is filled in `render`. Pictures are described under Step 5.

| key | by | fields | chapter | title | body | next |
|---|---|---|---|---|---|---|
| team | assistant | teaches | Welcome | You're not doing this alone. | {brand} comes with a team. They take care of the website, the payments and the marketing, so you can spend your time making great content. You'll meet each of them as we set up your site. | Let's start |
| site | designer | photos | Your site | Your site, built while we talk. | Every answer goes into your pages: home, about, contact and FAQ. I start building as soon as I know enough, and you can change anything later. | Next: your photos |
| ways | content | offers | How you'll work | Five ways to work with your students. | Pick as many as fit. Each one gets its place on your site, and I'll draft your first course, class or article while we talk. | Choose yours |
| reach | marketing | pitch | Finding students | How new students find you. | *(verified in Step 6)* | Next: your pitch |
| look | designer | site_style | Your look | A look is how your whole site feels. | It sets the fonts, the colours and the layout of every page, in light and dark. Your logo sits on top. Both change any time, and your words stay put. | Next: pick a look |
| pay | finance | payments | Getting paid | Three ways students can pay you. | Most creators mix them. Here's what three of your students might pay over three months. | Choose yours |
| membership | finance | memberships | Getting paid | A membership is a monthly pass. | Students pay one price each month and get everything it covers while they pay. One membership can cover everything you offer, or you can have a few, each for one thing. | Next: your memberships |
| access | finance | course_access, event_access, onsite_access | Getting paid | Ways in: who gets to open it. | Anything you make can be free, sold on its own, part of a membership, or several of these at once. Every course and class you add later has the same Access section. | Next: who can join |
| course | content | course_topic | Your first course | A course is your know-how, recorded once. | Students buy it, follow it at their own pace and keep it. It's made of modules, like weeks or chapters, and lessons, the videos inside them. I draft the outline; you record the videos. | Next: your course |
| live | content | live_topic | Your first online class | A live class happens at a set time. | Students sign up on your site and join the video call from it. It can run once, or every week at the same time. | Next: your class |
| onsite | content | onsite_topic | Your first in-person event | An in-person event lives on your site too. | Students see the place and the times and sign up online. The street address goes only to the students who can come. | Next: your event |
| inbox | community | contact | Your students | When students write to you. | *(verified in Step 6)* | Next: how to reach you |

- [ ] **Step 1: Write the failing tests** in `test_interview_slides.py` (pure functions, no DB; build `answers` dicts by hand; `brief.FIELDS` order is the order of questions):

```python
def test_opening_slide_is_due_before_the_first_question():
    assert [s.key for s in slides.due("teaches", {}, {}, None)] == ["team"]

def test_recorded_slides_never_come_back():
    assert slides.due("teaches", {}, {"team": "skipped"}, None) == []

def test_slide_for_a_field_answered_in_passing_shows_before_the_next_question():
    answers = {"teaches": "Yoga", "photos": "stock", "audience": "Parents", "offers": ["course", "live"]}
    keys = [s.key for s in slides.due("outcome", answers, {"team": "seen", "site": "seen"}, None)]
    assert keys == ["ways"]  # offers was settled without its question being asked

def test_a_slide_waits_for_its_own_question_when_the_model_reorders():
    # pitch not settled; the model asked story first: the reach slide is not due yet
    answers = {"teaches": "Yoga", "photos": "stock", "audience": "Parents", "outcome": "Calm", "offers": ["course"]}
    assert "reach" not in [s.key for s in slides.due("story", answers, {"team": "seen", "site": "seen", "ways": "seen"}, None)]

def test_conditional_slides_follow_what_was_picked():
    base = {..., "offers": ["course"], "payments": ["course"]}  # settled up to payments
    assert "membership" not in keys_due_at("memberships", base)  # memberships not required without a membership
    assert "access" in keys_due_at("course_access", {**base, "course_topic": "Reset"})
    assert "live" not in keys_due_at("course_topic", base)

def test_skipped_section_takes_its_slides():
    answers = {..., "offers": ["course"], "skipped": ["course"]}
    assert not {"course", "access"} & set(keys_due_at("article_topic", answers))

def test_slides_from_hides_slides_behind_it():
    answers = {...settled up to pitch...}
    assert [s.key for s in slides.due("pitch", answers, {}, "pitch")] == ["reach"]
    assert slides.due(None, answers, {}, slides.END) == []

def test_no_slides_at_go_live():
    assert slides.due(None, {"teaches": "Yoga"}, {}, None) == []

def test_first_is_true_only_on_a_presenters_first_slide():
    rendered = slides.render([SLIDE_BY_KEY["pay"], SLIDE_BY_KEY["membership"]], {}, None, {}, "Glow")
    assert [r["first"] for r in rendered] == [True, False]
    rendered = slides.render([SLIDE_BY_KEY["membership"]], {}, None, {"pay": "seen"}, "Glow")
    assert rendered[0]["first"] is False

def test_fallback_render_names_the_brand_and_has_a_picture():
    team = slides.render([SLIDE_BY_KEY["team"]], {}, None, {}, "Glow Face Yoga")[0]
    assert team["body"].startswith("Glow Face Yoga comes with a team.")
    pay = slides.render([SLIDE_BY_KEY["pay"]], {}, None, {}, "Glow")[0]
    assert len(pay["picture"]["students"]) == 3

def test_copy_keeps_the_words_rule():
    for s in slides.SLIDES:
        text = f"{s.title} {s.body}".lower()
        assert not re.search(r"\b(teach|teacher|teaching|coach|instructor)\b", text), s.key
```

Write the elided `...` answer fixtures as one module-level helper `_settled_through(field_id, **over) -> dict`. It fills every field before `field_id` in `brief.FIELDS` order with a plausible value: offers `["course"]`, payments `["course"]`, prices `29`, and `"stock"` for photos. `over` replaces or adds keys. Also define `keys_due_at(field_id, answers, record=None) -> list[str]`, returning `[s.key for s in slides.due(field_id, answers, record or {}, None)]`.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_slides.py -q`
Expected: FAIL with `ModuleNotFoundError: ... interview_slides`

- [ ] **Step 3: Implement `due`**

The rule, in `SLIDES` order:
1. Skip a slide that is in `record`.
2. Find its trigger: the first of `fields` that is in `{f.id for f in brief.required(answers)}`. If there is none, skip the slide.
3. Skip it when the trigger's index in `brief.FIELDS` is below `slides_from`'s index. `END` counts as `len(FIELDS)`, `None` as 0.
4. The slide is due when `trigger == next_field`, or when the trigger comes before `next_field` and `brief.is_settled(answers, trigger)`.
5. `next_field=None` returns `[]`.

- [ ] **Step 4: Implement `render`**

`first` is true when no recorded key's slide has the same `by` and no earlier slide in this list has it either. `title`, `body` and `next` come from the catalogue, with `{brand}` formatted. `picture` comes from `_picture(slide.key, answers, examples, brand)` (Step 5).

- [ ] **Step 5: Implement `_picture(key, answers, examples, brand) -> dict`, with `FALLBACK` examples**

`examples` has the shape of Task 3's `SlideExamples.model_dump()`, or is `None`. When it's `None`, or a list in it is shorter than needed, use the matching `FALLBACK` values for that piece. Format money with `brief.money(amount)`.

| key | picture |
|---|---|
| team | `{}` (the client draws the six faces with their `job` lines) |
| site | `{"pages": ["Home", "About", "Contact", "FAQ"]}` |
| ways | `{"items": [{"way": w, "example": str} for w in ("course", "live", "onsite", "articles", "community")]}` |
| reach | `{"brand": brand, "pitch": examples.pitch}` |
| look | `{}` (a static sketch of the same page in two palettes. This simplifies the spec's "home page in two looks once ready". The upgrade path is the `site_style` look cards' photos.) |
| pay | `{"students": [{"name", "about", "way": "course" \| "membership" \| "class", "months": [str \| None, str \| None, str \| None]}]}`. The course student pays `course_price` in month 1. The member pays the first membership's price in all three months. The class student pays `class_price` in months 1 and 3. |
| membership | `{"plans": [{"name", "price", "covers"}]}` (two) |
| access | `{"item": examples.course_title, "ticked": ["Sold on its own", "In a membership"]}` |
| course | `{"title", "modules": [three names], "lessons": int, "price": str}` |
| live | `{"title", "when"}` |
| onsite | `{"title", "place"}` |
| inbox | `{"name": students[0].name, "text": examples.message}` |

`FALLBACK` (field-neutral):
- Course "The 6-week program", modules "Week 1: The basics", "Week 2: Building the habit", "Week 3: Going further", 18 lessons, price 49.
- Class "Tuesday evening class", "Tuesdays, 7 pm", price 10.
- Event "Weekend workshop", "Your studio".
- Memberships "The Club" (19, "Every live class") and "Course library" (12, "Every course").
- Students Anna "Busy mum, short on time", Ben "Comes every week" and Cara "Drops in when she can".
- Ways: "A 6-week program people buy once and follow at home", "A weekly class students join from home, with you live", "A workshop or retreat at your own place", "Posts that bring new students in from search", "A members' space where your students keep each other going".
- Pitch "{brand}: calm, strong and simple, for people with busy lives."
- Message "Hi! Is the Tuesday class OK for complete beginners?"

- [ ] **Step 6: Verify the two unverified bodies against the code, then write them**

- **reach:** trace `answers["pitch"]`. `brief.apply_fact` copies it to `answers["description"]`, and `interview_milestones` uses it as the look-card headline. Find where `description` reaches the home page and the page's meta description. Say only what that trace shows. If both hold: "Your one-line pitch is what new visitors read first, on your home page and on Google. Articles and your social accounts bring more people to it." If only the home page holds, drop "and on Google".
- **inbox:** confirm the contact page's form lands in the coach's `apps.mailbox` inbox, and that class reminders are sent automatically (`apps.notifications` / the live reminders task). If both hold: "Messages from your site land in your inbox in the studio, and class reminders go out on their own. If you run a community, that's where your students talk to each other." Drop any clause that doesn't hold.

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_slides.py -q`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add backend/apps/tenant_config/interview_slides.py backend/apps/tenant_config/tests/test_interview_slides.py
git commit -m "feat(setup): slide catalogue and which slides are due before a question"
```

---

### Task 2: Slides on the guide, recorded, baseline for setups under way

**Files:**
- Modify: `backend/apps/tenant_config/interview.py` (`run_turn` after `setup_flow._update_flow(tenant, mutate)`, `interview_state` before its return, `OPENING_ACK`)
- Modify: `backend/apps/tenant_config/interview_slides.py` (add `record`, `attach`)
- Modify: `backend/apps/tenant_config/setup_flow_views.py`, `backend/apps/tenant_config/urls.py`
- Create: `backend/apps/tenant_config/migrations/0036_setup_slides_baseline.py`
- Test: `backend/apps/tenant_config/tests/test_interview_slides.py` (API tests reuse the `config`/`client`/`quiet` fixtures pattern from `test_interview.py`)

**Interfaces:**
- Consumes: Task 1 `due`, `render`, `SLIDE_BY_KEY`, `END`.
- Produces:
  - `attach(guide: dict, answers: dict, iv: dict, brand: str) -> None`: sets `guide["slides"]` to `render(due(guide["field"], answers, iv.get("slides") or {}, iv.get("slides_from")), answers, iv.get("slide_examples"), iv.get("slides") or {}, brand)`.
  - `record(tenant, key: str, skipped: bool) -> bool`: writes `iv["slides"][key] = "skipped" if skipped else "seen"` under `setup_flow._update_flow`; returns False for an unknown key.
  - `POST /api/v1/admin/setup-flow/slide/` with body `{"key": str, "skipped": bool}`: 204, or 400 `{"detail": "unknown slide"}`. Same permission and `_setup_over()` guard as `setup_flow_turn`; no AI throttle needed.
  - Guide dicts carry `"slides": list[dict]` (possibly empty) on the live guide only. It is never stored in transcript turns, so attach it after the transcript write, the way `guide["cards"]` is.

- [ ] **Step 1: Write the failing tests**

```python
def test_state_opens_on_the_team_slide(client, tenant_ctx):
    guide = client.get("/api/v1/admin/setup-flow/").json()["interview"]["guide"]
    assert [s["key"] for s in guide["slides"]] == ["team"] and guide["slides"][0]["by"] == "assistant"

def test_state_serves_only_unrecorded_slides(client, tenant_ctx):
    assert client.post(SLIDE_URL, {"key": "team", "skipped": True}, format="json").status_code == 204
    guide = client.get("/api/v1/admin/setup-flow/").json()["interview"]["guide"]
    assert guide["slides"] == []
    assert TenantConfig.objects.first().setup_flow["interview"]["slides"] == {"team": "skipped"}

def test_unknown_slide_is_400(client):
    assert client.post(SLIDE_URL, {"key": "nope"}, format="json").status_code == 400

def test_turn_attaches_slides_without_storing_them(client, tenant_ctx, quiet):
    body = client.post(TURN_URL, {"message": "Yoga"}, format="json").json()
    assert "slides" in body["guide"]
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert all("slides" not in t for t in turns)

def test_opening_ack_says_eighteen_minutes():
    assert "about 18 minutes" in interview.OPENING_ACK

def test_baseline_migration_skips_slides_behind_the_asked_field(tenant_ctx):
    # call the migration's forwards function with django.apps.apps
    ...  # a config with turns and asked="pitch" gets slides_from="pitch"; one with no turns gets nothing;
         # one with turns and asked=None gets slides_from=END; one that already has "slides" is untouched
```

- [ ] **Step 2: Run the tests and make sure they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_slides.py -q`
Expected: the new tests FAIL (`KeyError: 'slides'` / 404)

- [ ] **Step 3: Implement `attach` and `record`, and call `attach`**

- In `run_turn`, call `attach` right after `setup_flow._update_flow(tenant, mutate)`. It needs the interview dict re-read after the write: `TenantConfig.objects.first().setup_flow["interview"]`.
- In `interview_state`, call it before the return, with `iv`.
- In `OPENING_ACK`, change "about 15 minutes" to "about 18 minutes".

- [ ] **Step 4: Add the view `setup_flow_slide` and the URL `setup-flow/slide/`, name `setup-flow-slide`**

- [ ] **Step 5: Write migration `0036_setup_slides_baseline`**

It's a `RunPython` (reverse: noop) over `TenantConfig`. For each config whose `setup_flow["interview"]` has `turns` and neither a `slides` nor a `slides_from` key, set `slides_from = interview.get("asked") or "__end__"`. Write the literal `"__end__"` (don't import app code into a migration). The dependency is the latest `tenant_config` migration (`0035_focuscreation_covers`).

- [ ] **Step 6: Run the tests and make sure they pass**, then also `apps/tenant_config/tests/test_interview.py`

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_slides.py apps/tenant_config/tests/test_interview.py -q`
Expected: all pass. The first run after a new migration may need `make test-fresh` (xdist worker DBs).

- [ ] **Step 7: Run `npm run gen:api` in `frontend-customer`** and check that the `api-generated.ts` diff touches only the new endpoint. Then commit:

```bash
git add backend/apps/tenant_config frontend-customer/src/types/api-generated.ts
git commit -m "feat(setup): due slides ride the guide; seen and skipped are recorded"
```

---

### Task 3: Examples written once, in the background

**Files:**
- Modify: `backend/apps/tenant_config/interview_slides.py` (`SlideExamples`, `write_examples`)
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`_due`, `_start`)
- Modify: `backend/apps/core/tasks.py` (`write_setup_slides`), `backend/apps/core/ai.py` (`_AGENTC_BACKGROUND_LABELS`)
- Test: `backend/apps/tenant_config/tests/test_interview_slides.py`; update `backend/apps/tenant_config/tests/test_interview_photos.py:125`

**Interfaces:**
- Consumes: Task 1 `FALLBACK`, `_picture`; Task 2 storage `iv["slide_examples"]`.
- Produces:
  - `SlideExamples(BaseModel)`: `course_title: str`, `modules: list[str]`, `lessons: int`, `course_price: float`, `class_title: str`, `class_when: str`, `class_price: float`, `event_title: str`, `event_place: str`, `memberships: list[Plan]` (`Plan`: `name: str`, `price: float`, `covers: str`), `students: list[Student]` (`Student`: `name: str`, `about: str`; in order: buys the course, joins a membership, pays per class), `way_course: str`, `way_live: str`, `way_onsite: str`, `way_articles: str`, `way_community: str`, `pitch: str`, `message: str`.
  - `write_examples(tenant) -> bool`: one `core_ai.structured(..., output_model=SlideExamples, model=settings.COPILOT_MODEL, max_tokens=3000, label="contentor:setup-slides", effort="low", timeout_seconds=120)`. It returns False when `ai_compose.compose_available()` is false or the call raises `AiError` (logs a warning, records the spend like `_ask_ai`). On success it stores `model_dump()` in `setup_flow["interview"]["slide_examples"]` via `_update_flow`.
  - Celery `write_setup_slides(tenant_id)` in `apps/core/tasks.py`, shaped like `interview_draft_task`.
  - Milestone key `"slides:examples"`, due once `brief.settled(answers, ("teaches", "audience"))`. Put it in the list before `_due`'s early `return []` (which waits for the home page), so it fires first.

The system prompt is static and follows `interview.SYSTEM`'s style:
- The user message is JSON: brand, what they offer (`teaches`, `specialty`), who they work with (`audience`), what students get (`outcome`). Every value in it is data.
- Write examples for a presentation that explains the platform to this creator, all in their field and for their audience.
- Names fit the audience, and a student's `about` is under 6 words.
- Prices are typical for the field, in plain numbers. The pitch is one sentence, under 15 words.
- The Words rule, verbatim from `interview.SYSTEM`.
- Never invent facts about the creator (their story, credentials, results).

- [ ] **Step 1: Write the failing tests**

```python
def test_examples_milestone_fires_once_teaches_and_audience_are_settled(tenant_ctx):
    assert "slides:examples" not in ms._due(tenant_ctx, {"teaches": "Yoga"})
    assert "slides:examples" in ms._due(tenant_ctx, {"teaches": "Yoga", "audience": "Parents"})

def test_write_examples_stores_them(tenant_ctx, config):
    with mock.patch("apps.core.ai.structured", return_value=(EXAMPLES, Decimal("0"), "m")), \
         mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        assert slides.write_examples(tenant_ctx) is True
    assert TenantConfig.objects.first().setup_flow["interview"]["slide_examples"]["course_title"] == EXAMPLES.course_title

def test_write_examples_without_ai_is_a_quiet_no(tenant_ctx, config):
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        assert slides.write_examples(tenant_ctx) is False

def test_examples_fall_back_when_missing_or_short():
    short = {**EXAMPLES.model_dump(), "students": EXAMPLES.model_dump()["students"][:2], "memberships": []}
    pay = slides.render([SLIDE_BY_KEY["pay"]], {}, short, {}, "Glow")[0]
    assert len(pay["picture"]["students"]) == 3
    plans = slides.render([SLIDE_BY_KEY["membership"]], {}, short, {}, "Glow")[0]["picture"]["plans"]
    assert len(plans) == 2

def test_setup_slides_runs_in_the_background_on_the_hub():
    assert "contentor:setup-slides".startswith(ai._AGENTC_BACKGROUND_LABELS)
```

Also update `test_interview_photos.py:125` from `== []` to `"page:home" not in milestones._due(...)`, because `slides:examples` is now due there.

- [ ] **Step 2: Run them to make sure they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_slides.py apps/tenant_config/tests/test_interview_photos.py apps/core/tests/test_ai.py -q`
Expected: the new tests FAIL

- [ ] **Step 3: Implement** `SlideExamples`, `write_examples`, the task, the milestone (`_start`: `action == "slides"` → `transaction.on_commit(lambda: tasks.write_setup_slides.delay(tenant_id))`), and the label.

- [ ] **Step 4: Run** the same command plus `apps/tenant_config/tests/test_interview_milestones.py`
Expected: all pass (`fired[:3]` there is unchanged because `slides:examples` comes after the home keys, or fired earlier on its own turn).

- [ ] **Step 5: Check the prompt once on the dev stack.** Run `write_examples` for the demo tenant in `make shell`, then read the stored JSON. It should be in-field, use no "teach/coach" words, and have 3 students and 2 memberships. Then commit:

```bash
git add backend/apps/tenant_config backend/apps/core/tasks.py backend/apps/core/ai.py
git commit -m "feat(setup): slide examples for each creator, written once in the background"
```

---

### Task 4: Build-status lines signed by the team

**Files:**
- Modify: `backend/apps/tenant_config/interview.py` (`STARTED`, `started_note`, the `guide["status"]` assignment in `run_turn`)
- Test: `backend/apps/tenant_config/tests/test_interview.py` (update the test around line 236)

**Interfaces:**
- Produces: `started_note(fired: list[str]) -> tuple[str, str | None]`, which returns (text, the owner's key when one specialist does all of it, else None). `run_turn` sets `guide["status"] = text` and `guide["status_by"] = owner` (only when text is non-empty).
- Owners: `page:*` → designer; `draft:course`, `draft:event`, `draft:onsite` → content; `draft:post` → marketing. Names come from `team.NAMES`.

The exact copy:
- With `page:home`: `f"I have enough to start building, so your team is on it: {clauses}. Bear with me, it takes about a minute. Let's keep going while they build."`. Clauses are `f"your {Name} on {what}"` joined with `say_list` and grouped by owner in first-seen order; one owner's things are joined with "and".
- Without `page:home`, one owner: `f"Your {Name} is starting on {what} now."`
- Without `page:home`, several owners: `f"Your team is starting on {say_list(clauses)} now."`, with clauses as above.

- [ ] **Step 1: Update the tests** to:

```python
assert interview.started_note(["page:about"]) == ("Your Designer is starting on your About page now.", "designer")
assert interview.started_note(["style:auto", "rank:logos"]) == ("", None)
text, by = interview.started_note(["style:auto", "page:home", "rank:logos", "draft:course"])
assert text.startswith("I have enough to start building, so your team is on it: your Designer on your home page and your Content Creating Specialist on a first draft of your course.")
assert by is None
```

Also update the API assertion at line ~240 to the new text. Assert `body["guide"]["status_by"] is None` there, and `== "designer"` for a pages-only turn.

- [ ] **Step 2: Run them to make sure they fail.** Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview.py -q`. Expected: FAIL on the old text.
- [ ] **Step 3: Implement**; then **Step 4: run the same command** and expect all to pass.
- [ ] **Step 5: Commit** `feat(setup): build-status lines signed by the specialist doing the work`

---

### Task 5: The hand-off lines at go-live

**Files:**
- Create: `backend/apps/tenant_config/interview_team.py`
- Modify: `backend/apps/tenant_config/interview_golive.py` (`golive_state` returns `"team"`)
- Test: `backend/apps/tenant_config/tests/test_interview_team.py`

**Interfaces:**
- Produces: `handoff(tenant, answers: dict, flow: dict) -> list[dict]`, six items in `team.KEYS` order, each `{"key": str, "did": str, "next": str}`. It uses `setup_flow.content_snapshot(flow)` (course, event and post titles), `membership_plan_ids(flow)` → active `SubscriptionPlan` names, the `page_builds` keys with `interview_golive._PAGE_LABELS`, `answers["contact"]`, `answers["offers"]`, and `can_monetize(tenant)` (already imported in `interview_golive`).

The copy (code-owned; a clause whose data is missing is dropped):

| key | did | next |
|---|---|---|
| designer | "Built your {Home, About and Contact} pages and your look." | "Ask me to change any page, any time." |
| content | "Drafted {course title} and {class title}." / without either: "Ready when you want to make your first course or class." | course: "Next: record the first lesson of {course title}." / else class: "Next: check the date and time of {class title}." / else "Tell me what you'd like to make first." |
| finance | memberships: "Set up {names}." / paid item: "Set your first prices." / else "Kept everything free for now." | sells and not `can_monetize`: "Next: connect payouts so you can get paid." / else "You can change any price in its Access section." |
| marketing | post: "Drafted your first article, {title}." / else "Ready to help new students find you." | post: "Next: publish {title} when you're happy with it." / else "Next: share your site where your students are." |
| community | "Set up how students reach you: {email, Instagram and contact form}." | "Messages from students land in your inbox." (only what Task 1 Step 6 confirmed about the inbox) |
| assistant | "Ran your setup." | "Not sure who to ask? Ask me." |

- [ ] **Step 1: Write the failing tests:** a finished flow with a course draft, one membership and a contact answer gives each line above. An empty flow gives the fallback lines. There are always six, in `team.KEYS` order. `golive_state(...)["team"]` is that list.
- [ ] **Step 2: Run them to make sure they fail.** Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_interview_team.py -q`. Expected: `ModuleNotFoundError`.
- [ ] **Step 3: Implement**; then **Step 4: run** that command plus `apps/tenant_config/tests/test_interview_golive.py` and expect all to pass.
- [ ] **Step 5:** `npm run gen:api` in `frontend-customer` (a `GoLiveState` change), then commit `feat(setup): go-live hands the creator over to their team`

---

### Task 6: The slides on screen

**Files:**
- Modify: `frontend-customer/src/lib/setup-flow.ts`, `frontend-customer/src/components/setup-flow/mock.ts`, `frontend-customer/src/components/copilot/specialist-face.tsx`, `frontend-customer/src/components/setup-flow/setup-flow.tsx`
- Create: `frontend-customer/src/components/setup-flow/concept-slides.tsx`, `frontend-customer/src/components/setup-flow/slide-pictures.tsx`

**Interfaces:**
- Consumes: Task 2's guide `slides` and `POST setup-flow/slide/`; Task 1's picture shapes.
- Produces:
  - In `lib/setup-flow.ts`: `export interface Slide { key: string; by: SpecialistKey; first: boolean; chapter: string; title: string; body: string; next: string; picture: Record<string, unknown> }`; `GuideTurn.slides?: Slide[]`; `SetupFlowApi.slide: (key: string, skipped: boolean) => Promise<void>` (real: `clientFetch(`${BASE}/slide/`, post({ key, skipped }))`; mock: resolves).
  - `ConceptSlides({ slides, brandName, onPass }: { slides: Slide[]; brandName: string; onPass: (key: string, skipped: boolean) => void })`. It shows `slides[0]`; the parent drops a passed slide from its list.
  - `SlidePicture({ slide }: { slide: Slide })` in `slide-pictures.tsx`, which switches on `slide.key`. An unknown key renders nothing.
  - `SpecialistFace` gains `size="lg"` (`size-12`, icon `size-6`).

- [ ] **Step 1: Types, API and mock.** Add the types and `api.slide`. In `mock.ts`, give the first mock guide `slides` with one `team` and one `pay` slide using Task 1's fallback, so `?mock` shows the deck.
- [ ] **Step 2: `ConceptSlides`.** The layout follows `.superpowers/brainstorm/49470-1792525945/content/storytelling-slides.html`:
  - A `<section aria-roledescription="slide" aria-label={title}>`.
  - Top bar: `SpecialistFace` (`lg`), the name `t("team.specialists.<by>.name")` from the `admin` namespace, plus `· {t("team.specialists.<by>.job")}` when `first`. On the right, the chapter and dots (only when more than one slide is due).
  - An `h2` title (the question's `h1` comes after), the body, `<SlidePicture>`.
  - The footer: a ghost `Button` "I know this" (not on the `team` slide, whose skip reads "Skip the introductions") and a primary `Button` with the `next` label.
  - Enter or → passes as seen. Focus moves to the title on each new slide. Entry uses the existing `sf-rise` animation under `motion-safe:`.
- [ ] **Step 3: `SlidePicture`.** Use the shapes from Task 1 Step 5 and the `--sf-*` tokens.
  - `team`: six faces with name and job, in `SPECIALIST_KEYS` order.
  - `site`: four page sketches.
  - `ways`, `pay`, `membership`, `access`, `course`, `live`, `onsite`: cards as in the mockup.
  - `reach`: a search-result card with `brandName`, host and pitch.
  - `look`: one page sketch in two palettes.
  - `inbox`: one message row.
  - Below 640 px, grids become one column.
- [ ] **Step 4: Wire into `Flow` (`setup-flow.tsx`).**
  - Keep `const [passed, setPassed] = useState<string[]>([])`, reset whenever `guide` changes.
  - `const due = live ? (guide.slides ?? []).filter((s) => !passed.includes(s.key)) : []`.
  - When `due.length` and the step isn't the photos screen, render `<ConceptSlides>` in the guide `<section>` instead of `QuestionScreen`. With the photos screen it's the same: slides first.
  - `onPass` adds the key to `passed` and calls `void api.slide(key, skipped).catch(() => {})`. A failed record only means the slide may show again after a reload, so there is no toast.
- [ ] **Step 5: Verify.** Run `make typecheck` and `make lint` (expect both clean), and `cd frontend-customer && npx vitest run` (expect pass). Open `/setup?mock` in the dev stack at desktop and 375 px: the team slide, then pay, then the question.
- [ ] **Step 6: Commit** `feat(setup): the team presents a slide before each new idea`

---

### Task 7: Signed status, the payouts card, and the hand-off on screen

**Files:**
- Modify: `frontend-customer/src/lib/setup-flow.ts` (`GuideTurn.status_by?: SpecialistKey | null`, `TeamLine`, `GoLiveState.team: TeamLine[]`), `frontend-customer/src/lib/interview.ts` (`questionSteps` carries `status_by` along with `status`), `question-screen.tsx`, `payouts-card.tsx`, `launch.tsx`, `go-live-card.tsx`, `golive-panel.tsx`, `setup-flow.tsx`, `mock.ts`

**Interfaces:**
- Consumes: Task 4's `status_by`; Task 5's `team`.
- Produces: `export interface TeamLine { key: SpecialistKey; did: string; next: string }`. The `onPublished` props in `GoLiveCard` and `GoLivePanel` become `(team: TeamLine[]) => void`. `GoLiveCard` passes `(await api.goliveAction("publish")).team`. `Flow` keeps `const [celebrate, setCelebrate] = useState<TeamLine[] | null>(null)`. `Celebration` gains `team: TeamLine[]`.

- [ ] **Step 1: Status.** In `question-screen.tsx` (status block, about line 415), render `<SpecialistFace k={step.status_by} size="sm" />` in place of the brass dot when `step.status_by` is set.
- [ ] **Step 2: Payouts.** At the top of `PayoutsCard`, add a byline: `SpecialistFace k="finance"`, "Financial Strategist", and the lead "Here's how you get paid." above the existing three `FACTS`, which keep their wording (the spec's slide 13).
- [ ] **Step 3: Celebration.**
  - Keep "{brand} is live" and the address. Change the line to "Anyone can visit your site now. Here's who's looking after what."
  - Then a two-column grid (one column below 640 px) of six cards: face, name from messages, `did`, `next`.
  - Buttons: primary "Go to your studio" (`onGo("/admin")`), outline "Visit your site" (`onGo("/")`).
  - The overlay scrolls inside itself when taller than the viewport.
- [ ] **Step 4: Mock.** `mock.ts`'s `goliveAction("publish")` returns a `team` built from Task 5's fallback lines.
- [ ] **Step 5: Verify.** `make typecheck`, `make lint` and `npx vitest run` in `frontend-customer` pass. By eye in `?mock`: the signed status line, the payouts byline, and the hand-off at desktop and 375 px.
- [ ] **Step 6: Commit** `feat(setup): signed status lines, the Financial Strategist on payouts, the team hand-off`

---

### Task 8: E2e and the full walk

**Files:**
- Modify: `e2e/specs/01-signup-onboarding.spec.ts`, `e2e/impact-map.json`

- [ ] **Step 1: Update the spec.**
  - `const slide = guide.locator('[aria-roledescription="slide"]')`. In the loop, before `action`: `if (await slide.isVisible()) { await slide.getByRole("button").last().click(); continue; }`. On the first pass, click `"Skip the introductions"` once and assert it moved on, so the skip path is covered.
  - Raise the loop bound from 50 to 70.
  - Replace "Go to your admin panel" with "Go to your studio", and assert 6 hand-off cards: `page.getByText("Ran your setup.")` is visible.
- [ ] **Step 2: Map the new files.** Add `concept-slides.tsx`, `slide-pictures.tsx`, `interview_slides.py` and `interview_team.py` to `e2e/impact-map.json` with the setup files' existing spec list. Run the selector self-test via `make lint`.
- [ ] **Step 3: Run the spec.** First `pgrep -fl 'playwright test'` must show nothing. Then `make e2e-spec SPEC=01-signup-onboarding`. Expected: PASS.
- [ ] **Step 4: Run backend tests for the change.** Run `make test-changed PLAN=1`, then run the planned tests with `docker compose exec -T django pytest <paths> -n auto`. Expected: pass.
- [ ] **Step 5: Walk it by eye on the dev stack.** Do two full setups (`reference-scratch-tenant-parked-at-a-setup-question` for a quick start):
  - one with membership + course + live class;
  - one free-only with articles.
  Time both against the spec's ~3 extra minutes, and read every slide for the Words rule and for claims.
- [ ] **Step 6: Commit** `test(e2e): setup walks through the team's slides and ends on the hand-off`
