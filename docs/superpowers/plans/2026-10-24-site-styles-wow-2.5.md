# Site Styles Wow, WP-2.5 (New Families: Proof, Statement, Video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan runs natively in the session that wrote it, as WP-2.0 did; Task 5's review is the one fresh agent.

**Goal:** Three new section families that show only what the coach gave: `proof` (her clients' words, her numbers, her press), `statement` (one big line from her belief) and `video` (her clip, on a loop). Each has a manifest entry, composer support that never invents (R10, S3), editor fields, and a neutral layout that wears every style's kit.

**Architecture:**
- **Manifest:** three entries in `packages/shared/src/sections/families.json`, a new `video` field type, and the variant `neutral` in all 21 style manifests. The backend validator learns the video field; the page signer adds a poster.
- **Layouts:** one implementation per family in `frontend-customer/src/components/sections/neutral/`, written against the `StyleKit` (`kit-contract.tsx`), the same contract AI-built sections use. `all-styles.ts` binds them to each style's kit, so every style gets them without 63 per-style files. A flagship adds its own layout beside `neutral` in WP-2.1–2.4.
- **Composer:** the three families are usable only when the coach gave their input. Her input is read from `wizard_state.answers` under keys WP-2.6 will write. The facts ride the composer's existing fact path: fallback fields the AI may not write survive the fill (`_fill_page`).

**Tech Stack:** Django 5.1 + django-tenants, pytest; Next.js 14 + Tailwind (`frontend-customer`), vitest with `renderToStaticMarkup`; Playwright for the captures.

**Spec:** `docs/superpowers/specs/2026-10-24-site-styles-wow-design.md`: §5 (decisions), §6 (R1–R11), §7's WP-2.5 and WP-2.6 briefs, §9 (log).

## Global Constraints

- **Never invent (S3, R10).** Proof renders only from input the coach gave, and the section hides when it is empty. The composer never writes a quote, a number, a press name or a clip.
- **Own media stays optional (D1).** Nothing waits on or asks for a clip, a testimonial or a belief. Without them, composition is unchanged.
- **Copy stays portable:** one content model per family, the same in every style.
- **Craft floor (R11):** AA contrast (4.5:1 text, 3:1 large text and UI); labels ≥ 12 px; text over 24 characters never uppercase below 48 px; pull quotes at line-height ≥ 1.12; no bounce easing; one price format.
- **Motion (R8):** CSS-first. Reduced motion shows every final state, and the clip never plays by itself. Moving content longer than 5 seconds has a pause control (WCAG 2.2.2).
- **No LCP regression.** The clip loads only near the viewport, never on the first screen by default.
- **Loading and feedback conventions** from the root `CLAUDE.md` (`make lint`'s `check-loading-patterns`).
- **Shared checkout.** Stage by path; `pre-commit run --files <your files>`, then `git commit --no-verify`. Never run `make lint` as is. Never revert or format files you did not change. Check `git log` before committing: a peer may have swept your files.
- **Backend tests from an agent shell:** `docker compose exec -T django pytest <path> -n auto -q` (`make test-app` needs a TTY).
- **After editing `packages/shared/src/sections/**/*.json`:** `make sections-sync`, then `docker compose restart django celery-worker` (the manifest is cached).
- **Before any e2e run:** `ps -eo pid,command | grep 'playwright test' | grep -v grep` (not `pgrep -f`, which matches wait loops). Wait if another run is going.

## Review Focus

1. **A plan cached before she gave her input.** A coach who adds a belief, proof or clip after her plan was written still gets them on home at the next compose. (Task 3, `test_cached_plan_gets_her_given_families_at_compose`.)
2. **A clip she deleted from her library.** It is never placed, and a page that still holds it signs to no URL, so the section hides instead of showing a dead player. (Task 3, `test_a_deleted_clip_is_not_placed`; Task 1, `test_a_deleted_library_video_signs_to_no_url`.)
3. **A quote without consent, or without a name.** Without consent it is never placed. Without a name it shows with no attribution: never a made-up "A student". (Task 3, `test_only_consented_quotes_are_placed`; Task 2, `proof shows a nameless quote without attribution`.)
4. **One long word on a phone.** A statement such as "Unapologetically" at giant size must not overflow 390 px. Its size is capped by its longest word (hyphenation is not reliable across browsers). (Task 2, `statement fits its longest word on a phone`; Task 5's phone capture of the `short` set.)
5. **Reduced motion.** The clip never starts by itself, and play stays one tap away. (Task 2, `autoplay waits for motion, sight and the visitor`.)
6. **A pasted page link as the clip.** The editor's picker also takes a URL. A YouTube or Vimeo page link cannot loop in `<video>`, so it counts as no clip. (Task 2, `clipSrc`; `video renders nothing without a clip it can loop`.)

## Calls this plan makes beyond the spec

- **The flagships' designed layouts of these families belong to WP-2.1–2.4,** not here. Each flagship's world (two inks, the card suite, the cover, the panel) is built there, and a layout designed before its world would be redone. Until then every style, flagships included, renders `neutral`.
- **One neutral layout per family, bound to each style's kit,** rather than one hand-built layout per style. The kit carries the style's wrap, display face, heading scale, label voice, buttons and section tones. That is what "a neutral default layout for every style" asks, at a third of a file per style.
- **WP-2.6's input contract is set here,** because the composer must read something. WP-2.6 writes these `wizard_state.answers` keys; tests set them directly:
  - `belief`: a string ("one thing you believe that most teachers in your field don't");
  - `proof`: `{"quotes": [{"quote", "name", "consent"}], "numbers": [{"value", "label"}], "press": ["<name>"]}`;
  - `clip`: `{"video_id": <int>}`, a `courses.Video` in her library.
- **All three families are given-only.** The planner sees one only when the coach gave its input. On home the composer places what she gave even when the plan left it out: `statement` takes philosophy's place, `video` follows the hero, and `proof` goes before the closing section. With nothing given, every site composes exactly as today.
- **The composer writes no words for `video`.** It cannot know what the clip shows. Heading and caption stay empty for the coach to fill.
- **Video v1 is a muted loop of a library clip:** a pause button, a poster, and no autoplay under reduced motion. Two follow-ups are left out:
  - sound with captions, which needs a public captions route for placed videos (today captions are served per lesson only, `courses/views.py:373`);
  - a rendered reel (`apps.reels.Reel.file_key`) as a source.
- **The poster comes from the clip's `thumbnail_url`,** added at read time by the page signer. It is never stored.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/sections/families.json` | `proof`, `statement`, `video` entries | 1 |
| `packages/shared/src/sections/types.ts` | `video` field type, field `help` | 1 |
| `packages/shared/src/sections/styles/*.json` (21) | `"proof"/"statement"/"video": ["neutral"]` in `variants` | 1 |
| `backend/apps/tenant_config/sections.py` | `_clean_video` | 1 |
| `backend/apps/tenant_config/serializers.py` | poster from the clip; a deleted clip signs to no URL | 1 |
| `backend/apps/tenant_config/views.py` | `_strip_volatile_urls` blanks `poster` | 1 |
| `frontend-customer/src/components/sections/neutral/{proof,statement,video,loop-video,index}.tsx?` (new) | The three neutral layouts, the loop player, `neutralSections(kit)` | 2 |
| `frontend-customer/src/components/sections/all-styles.ts` | Bind the neutral layouts to every style | 2 |
| `frontend-customer/src/lib/blocks/section-defs.ts` | Icons, placeholders, the `video` field, help text | 2 |
| `frontend-customer/src/components/sections/fixtures.ts` | Showcase content for the three families (5 sets) | 2 |
| `backend/apps/core/onboarding/site_composer.py` | `coach_given`, given-only guard, `_given_pins`, fallbacks, prompts | 3 |
| `backend/apps/core/copilot/blocks.py` | Proof and video stay out of the copilot's write surface | 4 |
| Spec §7 row and §9 line | Board and log | 5 |

---

### Task 1: Manifest, validation and signing

Budget: 30 min.

**Files:**
- Modify: `packages/shared/src/sections/families.json`, `packages/shared/src/sections/types.ts`, `packages/shared/src/sections/styles/*.json` (21 files), `backend/apps/tenant_config/sections.py`, `backend/apps/tenant_config/serializers.py`, `backend/apps/tenant_config/views.py`
- Test: `backend/apps/tenant_config/tests/test_sections.py`, `backend/apps/tenant_config/tests/test_pages_serializer.py`

**Interfaces:**
- Produces the three family entries, appended after `events`, in this exact shape (no `required` and no `min` on proof's lists, so the copilot's `_seed_section` never fills them):
  - `proof` (`imageHeavy: false`):
    - `heading` (text, 80);
    - `quotes` (items, max 3, itemLabel "Quote", help "Only words a client really said, with their permission."), with `quote` (text, 280, "What they said") and `name` (text, 40, "Their first name");
    - `numbers` (items, max 3, itemLabel "Number", help "Only numbers you can stand behind."), with `value` (text, 12) and `label` (text, 40, "What it counts");
    - `press` (items, max 6, itemLabel "Name", help "Where you were featured, as they name themselves."), with `name` (text, 40).
  - `statement` (`imageHeavy: false`): `statement` (text, 60, required, "One line you believe"), `attribution` (text, 60, "Attribution (creator name)").
  - `video` (`imageHeavy: true`):
    - `heading` (text, 80);
    - `caption` (text, 160);
    - `video` (video, required, "Clip", help "A short clip from your library. It plays muted, on a loop.");
    - `shape` (select `["vertical", "wide"]`, default `"vertical"`, "Shape").
- `FamilyField.type` gains `"video"`; `FamilyField` gains `help?: string`.
- `sections._clean_video(value) -> dict | None`: `{"url": str | None, "video_id": int | None}`. An unsafe URL becomes `None`. A non-integer `video_id` becomes `None`. Every other key is dropped, so a read-time `poster` is never stored.
- `_sign_assets(..., posters=None)`: a video node whose `video_id` resolves gets `url` and, when the clip has a `thumbnail_url`, `poster` (both via `sign_if_s3_key`). A `video_id` that no longer resolves gets `url = None`.

- [x] **Step 1: Write the failing tests**
  - `test_video_field_keeps_url_and_id_only`: `clean_section_block({"type": "section.video", "variant": "journal.neutral", "video": {"url": "https://x/a.mp4", "video_id": "12", "poster": "p"}})["video"] == {"url": "https://x/a.mp4", "video_id": 12}`.
  - `test_video_field_drops_unsafe_url_and_bad_id`: `{"url": "javascript:x", "video_id": "abc"}` → `{"url": None, "video_id": None}`.
  - `test_proof_lists_are_capped`: 5 quotes in → 3 out; unknown item keys dropped.
  - `test_every_enabled_style_ships_the_neutral_families`: for every enabled style, `variants(style, f) == ["neutral"]` for `f` in the three.
  - In `test_pages_serializer.py`, `test_a_placed_clip_gets_its_poster` (a `Video` with `s3_key` and `thumbnail_url`: the GET's video node has a signed `url` and a `poster`) and `test_a_deleted_library_video_signs_to_no_url` (`video_id` of a deleted row → `url is None`).
- [x] **Step 2: Run them, expect FAIL** (`unknown family`, `KeyError`).
  Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_sections.py apps/tenant_config/tests/test_pages_serializer.py -q -n auto`
- [x] **Step 3: Implement.**
  - Add the manifest entries and types.
  - Add the variants by text insertion after each style's `"events": [...]` line, so the 21 files keep their formatting.
  - Run `make sections-sync`.
  - Add `_clean_video`, the poster and the dead-clip rule, and `poster` in `_strip_volatile_urls`.
  - Restart django and celery-worker.
- [x] **Step 4: Run Step 2's command, expect PASS,** then the two files' neighbours: `docker compose exec -T django pytest apps/tenant_config -q -n auto`.
- [x] **Step 5: No commit yet.** The frontend does not typecheck until Task 2 adds the icons and fixtures. Tasks 1 and 2 commit together (0b5c98a7).

### Task 2: Neutral layouts, registry and editor

Budget: 75 min.

**Files:**
- Create:
  - `frontend-customer/src/components/sections/neutral/proof.tsx`, `statement.tsx`, `video.tsx`;
  - `frontend-customer/src/components/sections/neutral/loop-video.tsx` (`"use client"`);
  - `frontend-customer/src/components/sections/neutral/index.ts`.
- Modify: `frontend-customer/src/components/sections/all-styles.ts`, `frontend-customer/src/lib/blocks/section-defs.ts`, `frontend-customer/src/components/sections/fixtures.ts`
- Test: `frontend-customer/src/components/sections/__tests__/neutral-families.test.ts`

**Interfaces:**
- Consumes: Task 1's manifest; `StyleKit` (`kit-contract.tsx`); `Txt`, `has`, `itemsOf`, `EmptyHint` (`kit.tsx`).
- Produces:
  - `neutralSections(kit: StyleKit): Pick<StyleSections, "proof" | "statement" | "video">`, each family `{ neutral: SectionComponent }` bound to `kit`;
  - `ProofNeutral`, `StatementNeutral`, `VideoNeutral`: `(props: SectionProps & { kit: StyleKit })`;
  - `shouldPlay(s: { reducedMotion: boolean; visible: boolean; choice: "auto" | "play" | "pause" }): boolean`: the visitor's choice wins; on `auto` it plays only on screen and only when motion is welcome;
  - `statementSize(statement: string): string`, the CSS font size: the length step, capped so the longest word fits (`calc((100vw - 3rem) / (letters × 0.7))`);
  - `clipSrc(value): string`, a library clip's URL or a direct video file's, else "";
  - `LoopVideo({ src, poster, label, className })`;
  - `STYLE_SECTION_MODULES[id][f]` is `{ ...style's own [f], ...neutral[f] }`, so a flagship's own layout comes first and `neutral` stays beside it.
- **The layouts** (kit tokens only, no hard-coded colours):
  - **Statement:** `kit.Section tone="inverse"` (the flooded band) and `kit.display`.
    - Size steps by length: ≤ 24 characters `text-[clamp(3.5rem,1rem+10vw,11rem)]`, ≤ 40 `text-[clamp(3rem,1rem+7vw,8rem)]`, else `text-[clamp(2.4rem,1rem+5vw,6rem)]`.
    - `max-w-[18ch] text-balance`; the font size from `statementSize`.
    - Over 24 characters: `normal-case [line-height:1.12]`.
    - The attribution sits under it in `kit.label`.
    - On the public site, no statement renders nothing.
  - **Proof:** `kit.Section tone="surface"`, with its optional heading in `kit.h2`.
    - Numbers: a `<dl>` row of at most three, the value in `kit.display` and `kit.num`.
    - Quotes: `<figure><blockquote>` at `text-xl/relaxed text-pretty`, with the name as `<figcaption>` only when given.
    - Press names: one row after the label "In the press" (the costume-label guard bans "Featured").
    - Items missing their text are skipped; a number needs both value and label.
    - Nothing to show: the public site renders nothing, and the editor shows `EmptyHint` with "This section stays hidden until you add a client's words, a number or a press name."
  - **Video:** `kit.Section tone="base"`.
    - `vertical`: the text column beside a 9:16 player at most `22rem` wide, stacked on phones.
    - `wide`: the heading above a 16:9 player at the wrap's width.
    - No clip URL: the public site renders nothing, and the editor shows `EmptyHint` with "Pick a clip in the panel on the left."
  - **LoopVideo:**
    - `<video muted loop playsInline poster>` with no `autoPlay` attribute, so the server render is a still poster (`preload="none"` with a poster, `"metadata"` without);
    - an `IntersectionObserver` (threshold 0.25) plays and pauses it via `shouldPlay`;
    - a 44 px toggle button labelled "Pause video" or "Play video" (lucide `Pause` / `Play`).
- **Editor** (`section-defs.ts`):
  - icons: `proof: MessageSquareQuote`, `statement: Megaphone`, `video: Clapperboard`;
  - placeholders: `proof: { heading: "In their words" }`, `statement: { statement: "One line you believe." }`, `video: { shape: "vertical" }`;
  - `toField` maps `video` to `{ key, label, type: "video", required, helpText: f.help }` and passes `helpText: f.help` on repeaters.
- **Fixtures:** each of the 5 sets gets the three families (dev-only showcase):
  - `short` statement "Unapologetically";
  - `long` statement at 60 characters;
  - the video's `url` is `/fixture-clip.mp4` (missing on purpose, so the poster shows) with a `FIXTURE_PHOTOS` poster.

- [x] **Step 1: Capture before:** `make design-shots FIXTURE=yoga LABEL=wp-2.5-before` (needs `make health-check` green). Note the folder.
- [x] **Step 2: Write the failing tests** in `neutral-families.test.ts`:
  - `every style resolves proof, statement and video to its neutral layout`: for every id in `SITE_STYLES`, `resolveSection(STYLE_SECTIONS, f, \`${id}.neutral\`)` is not null and `SITE_STYLES[id].variants[f]` includes `"neutral"`;
  - `proof renders nothing on the public site when empty`: markup of `{quotes: [{quote: "", name: ""}], numbers: [{value: "12", label: ""}]}` is `""`;
  - `proof shows a nameless quote without attribution`: a quote without a name has no `<figcaption>`, and one with a name has one with it;
  - `proof in the editor says it stays hidden`: with `editable`, the markup contains "stays hidden";
  - `statement drops caps over 24 characters`: "Breathe first." lacks `normal-case`, and a 30-character line has it;
  - `statement fits its longest word on a phone`: "Unapologetically" is capped at `calc((100vw - 3rem) / 11.20)`;
  - `video renders nothing without a clip it can loop; vertical is 9:16`: no url or a YouTube link → `""`; `shape: "vertical"` → `aspect-[9/16]`, the poster, no `autoplay`;
  - `the editor offers her clip, her clients' words and a line she believes`: the `video` field, proof's help text, the defaults;
  - `autoplay waits for motion, sight and the visitor`: `shouldPlay` truth table.
- [x] **Step 3: Run, expect FAIL:** `cd frontend-customer && npx vitest run src/components/sections/__tests__/neutral-families.test.ts`.
- [x] **Step 4: Implement** the layouts, the registry binding, the editor entries and the fixtures.
- [x] **Step 5: Run Step 3's command, expect PASS,** then the section suite and the types:
  - `npx vitest run src/components/sections src/lib`;
  - `npx tsc --noEmit -p .` in `frontend-customer` (fresh, not the container's incremental build).
- [x] **Step 6: Check the editor:** pinned by the editor test above instead of by hand. Adding sections to the shared `demo-yoga` tenant would change the pages e2e reads, and the editor saves as you go. The repeater now shows its help text (`field-renderer.tsx`).
- [x] **Step 7: Commit Tasks 1 and 2:** `pre-commit run --files <files>`, then `git commit --no-verify -m "feat(sections): proof, statement and video families, with a neutral layout in every style"`.

### Task 3: Composer: given-only families, never invented

Budget: 60 min.

**Files:**
- Modify: `backend/apps/core/onboarding/site_composer.py`
- Test: `backend/apps/core/tests/test_site_composer.py`

**Interfaces:**
- Consumes: Task 1's manifest.
- Produces:
  - `GIVEN_FAMILIES = ("proof", "statement", "video")`.
  - `FACT_FIELDS` gains `"quotes", "numbers", "press"`, so the AI never writes them.
  - `_writable("video") == {}`: the composer writes no words for a clip.
  - `coach_given(tenant) -> dict` reads `interview_brief.answers_of(tenant)` and returns `{"belief": str, "proof": {"quotes": [{"quote", "name"}], "numbers": [{"value", "label"}], "press": [{"name"}]}, "clip": {"url": None, "video_id": int} | None}`:
    - quotes with `consent` not `True`, or without text, are dropped;
    - numbers need both value and label;
    - lists are capped at 3, 3 and 6;
    - text is clamped with `sections.clamp_text` to the manifest maxes;
    - the clip counts only when `courses.Video` with that pk exists (checked inside `tenant_context`).
  - `given_families(given: dict) -> frozenset[str]`: `"statement"` when there is a belief, `"proof"` when any list is non-empty, `"video"` when there is a clip.
  - `apply_guardrails(plan, style_id, given=frozenset())` and `_guard_page(page_key, raw, style_id, given=frozenset())`: `usable(family)` is false for a family in `GIVEN_FAMILIES` that is not in `given`.
  - `_keep_rhythm(entries, protected) -> list[dict]`: the existing photo-led rhythm loop, extracted unchanged, except that it never pops a family in `protected`.
  - `_given_pins(style_id, page_key, entries, given) -> list[dict]`, pure, applied after the rhythm pass in `_guard_page` and again in `compose_page` on the plan's entries (before `_home_pins`):
    1. drop entries of `GIVEN_FAMILIES` not in `given`;
    2. on home, place what was given and is missing:
       - `statement` replaces `philosophy` at its position, else goes before the closing section;
       - `video` goes at index 1;
       - `proof` goes before the closing section;
    3. keep only the first of `philosophy` and `statement` on a page;
    4. while there are more than `MAX_SECTIONS` entries, drop the last one that is not the hero, not the closing section, not required and not given;
    5. `_keep_rhythm(entries, protected=required ∪ given)`.
  - `_plan_user_turn(coach, style_id, given=frozenset())` lists a given-only family only when it is in `given`.
  - `_coach_data` adds `"belief"` only when the answer is non-empty, so the prompts of coaches without one are unchanged.
  - `compose_page` sets `ctx["given"] = coach_given(tenant)`. `fallback_fields` returns:
    - `proof`: the given lists, with heading "In their words" when there are quotes, else "";
    - `statement`: the belief when it fits in 60 characters, else its first sentence when that fits, else "";
    - `video`: `{"video": clip, "shape": "vertical"}`.
  - **Prompt lines:**
    - In `PLAN_SYSTEM_PROMPT`'s Families list:
      - "statement: one line the coach believes, set huge as the page's peak. Listed only when the coach gave a belief; on home it takes philosophy's place."
      - "proof: what the coach's clients said, numbers the coach stated, press that featured them. Listed only when the coach gave them."
      - "video: a short clip of the coach at work, playing on a loop. Listed only when the coach gave one."
    - `video` joins the photo-led list.
    - In `PAGE_SYSTEM_PROMPT`'s Honesty block:
      - "statement.statement is the coach's belief (belief in the coach data) as one line of at most 60 characters, in their words: shorten it, never change what it says. Two words are welcome."
      - "proof: write only its heading, short and fitting what it holds; its quotes, numbers and press are the coach's own and are added for you."

- [x] **Step 1: Write the failing tests:**
  - `test_ai_never_writes_proof_or_clip_words`: `_writable("proof")` has only `heading`; `_writable("video") == {}`.
  - `test_given_only_families_are_dropped_without_input`: a plan naming proof, statement and video on home, guarded with `given=frozenset()`, has none of them.
  - `test_home_places_what_she_gave`: guarded with all three given and a home plan without them, statement sits where philosophy was (with no philosophy left), video is at index 1, proof is just before the closing section, the length is ≤ `MAX_SECTIONS`, and no more than two photo-led sections run in a row.
  - `test_philosophy_and_statement_never_share_a_page`.
  - `test_only_consented_quotes_are_placed`: answers with one consented and one unconsented quote, `coach_given` keeps the first; `compose_page` (AI off) stores exactly its text in `section.proof`.
  - `test_a_deleted_clip_is_not_placed`: `answers.clip.video_id` of no `Video` → `coach_given(...)["clip"] is None` and no video section on home.
  - `test_cached_plan_gets_her_given_families_at_compose`: a stored plan without proof; the answers then gain proof; `compose_page(tenant, "home")` stores a `section.proof`.
  - `test_statement_fallback_is_her_belief`: AI off, belief "Rest is part of training." → the stored statement equals it; a 200-character belief whose first sentence fits → that sentence.
  - `test_nothing_given_composes_as_before`: `apply_guardrails({}, s)` equals `apply_guardrails({}, s, frozenset())` for every enabled style, and neither holds a given-only family.
- [x] **Step 2: Run, expect FAIL:** `docker compose exec -T django pytest apps/core/tests/test_site_composer.py -q -n auto -k "given or proof or clip or statement or writes"`.
- [x] **Step 3: Implement** the interfaces above.
- [x] **Step 4: Run the whole composer file, expect PASS:** `docker compose exec -T django pytest apps/core/tests/test_site_composer.py -q -n auto`.
- [x] **Step 5: Commit:** `git commit --no-verify -m "feat(composer): proof, statement and video only from what the coach gave"`.

### Task 4: Copilot: proof and video stay out of its write surface

Budget: 20 min.

**Files:**
- Modify: `backend/apps/core/copilot/blocks.py` (`BLOCK_SCHEMA`)
- Test: `backend/apps/core/tests/test_copilot_blocks.py`

**Interfaces:**
- `COPILOT_NEVER = ("proof", "video")`: those families are left out of `BLOCK_SCHEMA`.
  - The module's own trust boundary already leaves testimonials out "so fabricated social proof stays impossible". The legacy video block waits on media handling for the same reason.
  - So `build_block` and `clean_field` refuse both families as unknown types, and the copilot's field guide never lists them.
  - The coach adds and edits them in the editor. This replaces a prompt line, which the model could ignore.
- `statement` stays writable, like `philosophy`.

- [x] **Step 1: Write the failing test** `test_build_block_refuses_proof_and_video_sections`: both families raise `BlockOpError` from `build_block` and `clean_field`, and a statement still builds.
- [x] **Step 2: Run:** `docker compose exec -T django pytest apps/core/tests/test_copilot_blocks.py -q -n auto`.
- [x] **Step 3: Implement** the exclusion in `BLOCK_SCHEMA`.
- [x] **Step 4: Run Step 2's command, expect PASS.**
- [x] **Step 5: Commit** with Task 3 (d3fde2d8): `git commit --no-verify -m "feat(composer): proof, statement and video only from what the coach gave"`.

### Task 5: Verify, capture, review, record

Budget: 45 min.

- [x] **Step 1: Run the gates** (one heavy job at a time). Results are in spec §9: the backend suite, both vitest suites and both typechecks are green; the e2e failures are all outside this work.
  - `make test-changed` (trust its plan, `PLAN=1` to preview);
  - after the e2e check above, `make e2e-changed`.
- [x] **Step 2: Capture after:** `make design-shots FIXTURE=yoga LABEL=wp-2.5-after`. Home recipes did not change, so the home pages must match Step 1 of Task 2, kinetic's ticker band aside.
- [x] **Step 3: Capture the three families in all 21 styles.** A script in the git-ignored `e2e/eval-shots/design/<YYYYMMDD-HHMM>-wp-2.5/tools/capture.cjs` shoots `/design-showcase?style=<id>&family=<f>&size=real&fixture=yoga&bare=1` and `size=short`, at 1440×900 and 390×844. It writes one sheet per family per viewport (PIL) and an `index.html`.
  - On the phone sheets, no statement overflows its band.
  - Every proof is legible on its tone.
  - Every player keeps its button inside the screen.
- [x] **Step 4: Fresh review:** one fresh reviewer agent (30-minute budget) reads the diff against this plan's Interfaces, spec §6 and S3. Fix what it confirms, with no second round. Done in 70fed0da.
  - Confirmed and fixed:
    - an empty statement replaced philosophy;
    - a dead Play button after a refused autoplay;
    - a planned philosophy beat her statement;
    - a string `press` was split into letters;
    - AI-built (cx) sections could lay out proof or video. `sections.AI_NEVER_FAMILIES` now covers the copilot and cx.
  - Also fixed:
    - clamping that cut her words;
    - the label ink and capitals;
    - loading before the clip nears the screen;
    - the editor's reason for a page link.
- [x] **Step 5: Record:**
  - Spec §7: row 2.5 set to `done (<date>, <sha>)` and its Plan cell linked to this file.
  - Spec §9: one line on what changed and what was learned. Note that the flagships' layouts of these families move to WP-2.1–2.4 and that WP-2.6 writes the answers contract.
  - The program memory: next is WP-2.1.
- [x] **Step 6: Commit the docs:** `git commit --no-verify -m "docs(styles): WP-2.5 done"`. Deploy waits for the owner: these families stay inert until WP-2.6 asks for the input.
