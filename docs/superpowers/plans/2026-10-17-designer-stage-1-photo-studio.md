# Designer stage 1: covers she can design — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photo studio in Site where a creator designs course and event covers, and every place her
site shows a cover draws the kept design live, in the nearest of three shapes.

**Architecture:** A cover is a `Design` row (tenant schema, `apps.media`) holding a JSON recipe:
a layout id, content (photo, words, badge, logo) and style, plus per-size frame overrides. One
React renderer, `CoverArt`, draws a recipe at any frame: CSS container queries pick Card, Wide or
Banner, the look's own palette and fonts are applied inline, and nothing is rasterised. Keep makes a
draft the target's cover through a History row whose inverse undoes it.

The plan ships in two parts:
- **Part A** (Tasks 1–12): the whole pipeline, with simple controls on every screen. It is the phone
  editor of E18.
- **Part B** (Tasks 13–15): the desktop canvas (select, drag, resize, layers, rail and drawers).

**Tech Stack:** Django 5.1 + DRF + django-tenants, pytest; Next.js 14 App Router, React 18,
Tailwind 3.4 + CSS Modules (container queries in plain CSS), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-designer-end-to-end-design.md` (stage 1 = §4, §7.1–7.3,
decisions E7–E18).

## Global Constraints

- A cover never loses its words to a crop. Three sizes, drawn from one recipe:
  - **Card**: the look's `coverAspect`;
  - **Wide**: 16/9;
  - **Banner**: 3/1.
  A frame shows the nearest size by aspect ratio. A frame narrower than 180 px shows the photo,
  panel and shapes only (no words, badge or logo).
- Covers are drawn live. No image file is made in this stage (E10).
- Covers use the look's own light palette whatever the viewer's scheme (§7.2), and only the look's
  two fonts, display and body (E11).
- Colours are a palette role (E17 list in Task 6) or `#rrggbb`.
- Nothing changes on a course or event until Keep (E8). Keep writes a History row
  (`CopilotAudit`); Undo restores the previous cover and refuses when the cover changed since.
- An event cover belongs to the series: same event kind and exact title (E14).
- Words follow the item: `words.title === null` means the item's current title. Badge kinds `new`
  (course created within 30 days), `date` (the row's `scheduled_at`), `live` and `text` (E16).
- Where a look prints its own title over the cover, the cover draws in `bare` mode (E15):
  - `rows.tsx` Billboard and Tile;
  - kinetic's Poster;
  - `course-card.tsx` variant `overlay`.
- The look's photo effects (`imgClassName`: greyscale, hover zoom) apply to the cover's photo layer.
- Advanced editing (Part B) only at `lg` (1024 px) and up. Below it the simple controls of Part A
  are the editor (E18).
- A new photo is generated only from the "New" tab. Each one counts against
  `CURATED_IMAGE_GENERATE_MONTHLY_LIMIT` (20), shared with the Designer (E12).
- UI copy speaks to her as "you", plain and short, signed nowhere. Brand rule: "creator", never
  coach, teacher or admin.
- Loading and feedback conventions from the root `CLAUDE.md`:
  - `<Button loading>`, `useAsyncAction` and `<PageState>`;
  - a `loading.tsx` per route segment;
  - sonner toasts;
  - `<NavLink>` and `useNavigate()`;
  - `<StaleContainer>` for search refinements.
- Shared checkout: stage and commit only this plan's files and hunks. Never revert peer changes.
  The working tree already carries a peer's uncommitted edits in `interview*.py`, the store bundles
  and `content-picker.tsx`.

## Review Focus

1. **Her cover photo changes elsewhere after Keep** (photo picker, /setup, the copilot's
   `set_course_cover`). The new photo shows, not the stale design. Mechanism: a kept design shows
   only while the row's `thumbnail_id` equals the recipe's photo id. Test in Task 3.
2. **A photo a kept design uses is deleted from Media.** Serializers do not crash; `CoverArt`
   draws its tinted placeholder for that layer. Tests in Task 3 and Task 7.
3. **A 90-character title or Turkish letters (ş, ğ, ı, İ).** The validator caps the title at 90
   characters. Each text part clamps to its line budget inside its frame. The look's Google Fonts
   link serves the latin-ext subset. Tests in Task 2 and Task 7.
4. **Two tabs keep two drafts of one target.** Exactly one kept design per target (database
   constraint), the earlier one retired, and Undo of the earlier Keep refused. Test in Task 3.
5. **A session is renamed, or a session is added later to a series.** The renamed row leaves the
   series and shows its own photo. A new row with the series' kind and title adopts the series'
   cover photo when created. Tests in Task 3.

---

## Part A — the cover pipeline, simple controls

### Task 1: Each look names its Card shape

**Files:**
- Modify: `packages/shared/src/sections/types.ts` (the `SiteStyle` interface, near `photoWords`)
- Modify: `packages/shared/src/sections/styles/*.json` (21 files)
- Modify (generated): `backend/apps/tenant_config/sections_manifest/` via `make sections-sync`
- Test: `frontend-customer/src/lib/__tests__/cover-aspect.test.ts` (vitest only collects
  `frontend-customer/src/**/__tests__/**/*.test.ts`; import `SITE_STYLES` from `@shared/sections/styles`)

**Interfaces:**
- Produces: `export type CoverAspect = "3/4" | "4/5" | "1/1" | "4/3" | "3/2" | "16/10";` and
  `SiteStyle.coverAspect: CoverAspect`.

- [ ] **Step 1: Write the failing test.** For every entry of `SITE_STYLES`, expect `coverAspect` to
  be one of the six values. Expect `atelier` to be `"3/4"` and `encore` to be `"1/1"`.
- [ ] **Step 2: Run it.** `cd frontend-customer && npx vitest run src/lib/__tests__/cover-aspect.test.ts`.
  Expected: FAIL (undefined).
- [ ] **Step 3: Add the field to the type and to each JSON.** Take the value from the shape of each
  look's main course card in `frontend-customer/src/components/sections/<look>/courses.tsx`. Values
  seen on 2026-10-17:
  - `3/4`: atelier, maison
  - `4/5`: darkroom
  - `1/1`: encore
  - `16/10`: dojo, sprout, trail, workshop, studiofloor
  - `4/3`: ledger, nocturne, pop, primer, sanctum, tavola, velvet

  Journal (4/5 or 3/2 seen), kinetic (4/3 and a 4/5 poster), grid, manuscript and terminal: open
  the file and take the class of the card shown when there are several courses. Run
  `make sections-sync`.
- [ ] **Step 4: Run the test again.** Expected: PASS. Also run `make lint`, whose sections check
  must stay clean.
- [ ] **Step 5: Commit.** `git commit -m "feat(sections): each look names the shape it shows covers in"`

### Task 2: The `Design` model and its recipe validator

**Files:**
- Modify: `backend/apps/media/models.py`
- Create: `backend/apps/media/migrations/00NN_design.py` (`make makemigrations`)
- Create: `backend/apps/media/design_recipe.py`
- Test: `backend/apps/media/tests/test_design_recipe.py`

**Interfaces:**
- Produces: `class Design(models.Model)` with:
  - `id`: UUID primary key;
  - `kind`: CharField(20), default `"cover"`;
  - `target_kind`: CharField(10), one of `course`, `live`, `stream`, `zoom`, `onsite`;
  - `target_key`: CharField(200): the course id as text, or the event series title;
  - `state`: CharField(10), default `"draft"`, db_index; one of `draft`, `kept`, `retired`;
  - `recipe`: JSONField;
  - `made_by`: CharField(20), blank; `""` is her, otherwise a specialist key;
  - `run_id`: CharField(40), blank;
  - `created_at`, `updated_at`;
  - `kept_at`: nullable.

  Meta:
  - `UniqueConstraint(fields=["kind","target_kind","target_key"], condition=Q(state="kept"), name="media_one_kept_design_per_target")`;
  - ordering `["-updated_at"]`;
  - `app_label="media"`.
- Produces: `validate_recipe(value: dict, *, photo_exists: Callable[[str], bool]) -> dict` in
  `design_recipe.py`. It returns a cleaned recipe or raises `rest_framework.serializers.ValidationError`.
  Constants:
  - `LAYOUTS = ("panel","full","title","band","framed","photo")`
  - `SIZES = ("card","wide","banner")`
  - `PARTS = ("photo","panel","label","title","subtitle","logo","badge")`
  - `BADGE_KINDS = ("none","new","date","live","text")`
  - `FONT_ROLES = ("display","body")`
  - `PAINT_ROLES = ("primary","accent","ink","paper","surface","inverse","inverse-ink","primary-light","primary-dark","accent-light","accent-dark","white","black")`
  - `SHAPES = ("rect","circle","arch","line")`
  - `WEIGHTS = (400,500,600,700,800)`
  - `MAX_EXTRAS = 12`
  - `TEXT_MAX = {"label":40,"title":90,"subtitle":140,"badge":24,"extra":140}`

The recipe shape is shared with Task 6. Copy the clamp helpers `_hex`, `_num` and `_enum` from
`apps/tenant_config/logo_recipe.py`.

```ts
// frontend-customer/src/types/design.ts mirrors this exactly (Task 6)
interface CoverRecipe {
  version: 1;
  layout: LayoutId;
  photo: { id: string | null; focus: [number, number]; zoom: number;
           brightness: number; contrast: number; saturation: number; darken: number };
  words: { label: string; title: string | null; subtitle: string };
  badge: { kind: BadgeKind; text: string; fill: Paint };
  logo: boolean;
  panel: Paint;                                   // the layout's colour field
  styles: Partial<Record<PartId, PartStyle>>;     // PartStyle: scale weight upper tracking leading align color font hidden
  extras: Extra[];                                // text | badge | shape, each with id + frame
  overrides: Partial<Record<CoverSize, Record<string, Frame>>>;  // layer id -> frame
}
// Frame = { x, y, w, h } as fractions of that size's canvas
```

Clamp ranges:

| Field | Range |
|---|---|
| focus | 0–1 |
| zoom | 1–3 |
| brightness, contrast, saturation | 0.5–1.5 |
| darken | 0–0.7 |
| scale | 0.5–2 |
| tracking | -0.05–0.3 |
| leading | 0.9–1.6 |
| opacity | 0.1–1 |
| frame x, y | -0.5–1.5 |
| frame w, h | 0.02–2 |

Override keys must be a part id or an extra's id.

- [ ] **Step 1: Write the failing tests** in `test_design_recipe.py`:
  - `test_minimal_recipe_is_completed_with_defaults`: `{}` becomes layout `panel`, `photo.id` None,
    `words.title` None, badge kind `none`, `logo` True, `panel` `"primary"`, empty
    `extras` and `overrides`.
  - `test_rejects_unknown_layout_and_paint`: layout `"poster"` raises, and so does panel `"teal"`.
    `"#1E5AA8"` is kept.
  - `test_title_capped_at_90_and_turkish_kept`: a 120-character title comes back as 90 characters,
    and `"Şükran ğüş ıİ"` survives unchanged.
  - `test_clamps_numbers`: zoom 9 becomes 3, darken -1 becomes 0.
  - `test_foreign_photo_rejected`: `photo_exists` returns False, so it raises.
  - `test_extras_capped_and_overrides_need_known_ids`: 13 extras raise; an override for id `"zz"`
    is dropped.
- [ ] **Step 2: Run them.** `make test-app APP=media`. Expected: FAIL (import error).
- [ ] **Step 3: Implement** the model, the migration (`make makemigrations`) and `validate_recipe`.
- [ ] **Step 4: Run the tests again.** `make test-fresh`, needed once for the new migration, then
  `make test-app APP=media`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(media): a design, the recipe a cover is drawn from"`

### Task 3: Covers: open, keep, undo, and what a row shows

**Files:**
- Create: `backend/apps/media/designs.py`
- Modify: `backend/apps/core/copilot/views.py`:
  - `_restored_state`: add `restore_cover_design`;
  - `_apply_inverse`: add `restore_cover_design`;
  - `_audit_summary`: `keep_cover` gives "Kept a new cover for '<title>'".
- Modify: `backend/apps/live/serializers.py`: `_ScheduledOnCreateMixin.create` calls
  `designs.adopt_series_cover(instance)` after save.
- Test: `backend/apps/media/tests/test_designs.py`

**Interfaces:**
- Consumes: `Design`, `validate_recipe` (Task 2); `apps.core.copilot.content.event_model(kind)`;
  `apps.core.curated_images.cache.asset_id_from_key`.
- Produces, in `designs.py` (function-local model imports, as `apps/core` does):
  - `class DesignError(Exception)`, whose message is safe to show her.
  - `TARGET_KINDS = ("course","live","stream","zoom","onsite")`.
  - `target_rows(target_kind: str, target_key: str) -> list`: the course, or every event row of
    that kind with that exact title.
  - `target_title(target_kind: str, target_key: str) -> str`.
  - `open_draft(target_kind: str, target_key: str, *, recipe: dict | None = None, from_id: str | None = None, made_by: str = "") -> Design`.
    It returns the existing draft of that target if there is one, otherwise creates a draft with
    the validated `recipe` or a copy of design `from_id`'s recipe. It raises `DesignError` when the
    target has no rows.
  - `keep(design: Design) -> tuple[dict, dict]`, returning `(result, inverse)`:
    - The design must be a draft and its target must still exist.
    - It retires the previous kept design, marks this one kept with `kept_at`, and sets every
      target row's `thumbnail_id` to the recipe's photo id. A null photo id leaves thumbnails
      unchanged.
    - `result = {"id", "title", "target_kind", "target_key"}`.
    - `inverse = {"kind":"restore_cover_design", "design_id", "previous_id" (str|None),
      "target_kind", "target_key", "thumbnails": {str(row.pk): thumbnail_id|None}}`.
  - `cover_state(inverse: dict) -> list`: `[kept design id or None, sorted [pk, thumbnail_id] pairs]`.
    It feeds the History state stamp.
  - `restore_cover(inverse: dict) -> None`: the kept design becomes a draft again, the previous one
    is kept again if it still exists, and the thumbnails are restored. It raises `DesignError`
    ("that photo no longer exists") when a thumbnail photo is gone.
  - `adopt_series_cover(event) -> None`: if a kept design exists for `(kind_of(event), event.title)`
    with a photo, the event takes that photo as its thumbnail.
  - `kind_of(obj) -> str`: `course` for a Course, otherwise the `EVENT_KINDS` key of its model.
  - `cover_for(obj, context: dict) -> dict | None`, the payload serializers embed. It is memoised
    per `context`: one query for all kept cover designs, one for `TenantConfig` (look and logo).
    - It returns `{"id", "recipe", "photos": {photo_id: signed_url}, "logo_url", "look": "style[:palette]"}`.
    - It returns `None` when there is no kept design, or when `obj.thumbnail_id` differs from
      `recipe.photo.id` (Review Focus 1).
    - A photo id with no row is left out of `photos` (Review Focus 2).
  - `in_use_assets() -> dict[str, str]`: catalog asset id (`asset_id_from_key`) and own-photo
    `catalog_id`, mapped to the title of the course or series using it.

Wire the copilot History: `copilot/views.py` `_restored_state` and `_apply_inverse` handle kind
`restore_cover_design`. Make it a snapshot inverse (not order-free) by calling `designs.cover_state`
and `designs.restore_cover`. Map `DesignError` to the same 400 path as `ContentOpError`.

- [ ] **Step 1: Write the failing tests** in `test_designs.py`. Use the `tenant_ctx` fixture and
  create courses, live classes and photos directly:
  - `test_open_draft_reuses_the_targets_draft`.
  - `test_keep_course_sets_thumbnail_and_returns_inverse`.
  - `test_keep_series_sets_every_row`: three LiveClass rows titled "Morning Flow" and one titled
    "Evening Flow". Only the three change.
  - `test_keep_twice_keeps_one` (Review Focus 4): two drafts kept in turn leave one kept and one
    retired.
  - `test_restore_cover_brings_back_previous_and_draft`.
  - `test_restore_refused_when_photo_gone`: raises `DesignError`.
  - `test_design_hidden_when_photo_replaced` (Review Focus 1): after Keep, set the course's
    thumbnail to another photo, and `cover_for` returns None.
  - `test_payload_skips_deleted_photo` (Review Focus 2).
  - `test_new_session_adopts_series_cover` and `test_renamed_session_leaves_series`
    (Review Focus 5).
  - `test_undo_endpoint_restores_cover`: POST `/api/v1/admin/copilot/undo/` with the audit id from
    a Keep. The previous thumbnail is back.
- [ ] **Step 2: Run them.** `make test-app APP=media`. Expected: FAIL.
- [ ] **Step 3: Implement** `designs.py`, the copilot History wiring and the create hook.
- [ ] **Step 4: Run the tests again.** `make test-app APP=media` and `make test-app APP=core`
  (the copilot History tests). Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(media): keep a design as a cover, and undo it from History"`

### Task 4: The designs API, and the photo allowance

**Files:**
- Create: `backend/apps/media/design_views.py`, `backend/apps/media/design_urls.py`,
  `backend/apps/media/design_serializers.py`
- Modify: `backend/config/urls.py`: `path("api/v1/designs/", include("apps.media.design_urls"))`,
  next to `api/v1/photos/`.
- Modify: `backend/apps/core/curated_images/views.py`: `curated_image_generate` also answers GET
  with `{"limit", "used", "left"}` for this month, from the same cache counter.
- Test: `backend/apps/media/tests/test_design_views.py`; extend
  `backend/apps/core/tests/` with a curated-images allowance test (put it next to the existing
  generate tests).

**Interfaces** (every endpoint uses `IsCoachOrOwner`):

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/v1/designs/targets/` | `{"targets": [...], "in_use": {asset_id: title}, "look": "style[:palette]", "logo_url", "generations_left"}` (the Card shape comes from `look` on the client, via `SITE_STYLES`). Each target is `{target_kind, target_key, title, sessions (int, events), next_at (events), status ("draft"/"published" for courses), photo_url, cover (cover_for payload or null), draft_id}`. Courses first (`order`), then event series by next session. |
| GET | `/api/v1/designs/?state=draft\|kept` | Her designs, `DesignSerializer` (fields of the model plus `title`, `photos` {id: signed url}, `logo_url`, `look`). |
| POST | `/api/v1/designs/` | Body `{target_kind, target_key, recipe?, from?}`, calls `open_draft`. 201 when created, 200 when an existing draft is returned. 400 on `DesignError` or validation. |
| GET / PATCH / DELETE | `/api/v1/designs/<uuid>/` | PATCH takes `{recipe}`. PATCH and DELETE work on drafts only; otherwise 400 "a kept cover can't be changed; edit a copy". |
| POST | `/api/v1/designs/<uuid>/keep/` | `keep()`, then `_record_audit(tenant, user, {"kind":"keep_cover", "design_id", "title", "made_by"}, result, inverse)`, imported function-locally from `apps.core.copilot.views`. Returns `{"result", "audit_id"}`. |

- [ ] **Step 1: Write the failing tests** in `test_design_views.py`:
  - `test_student_gets_403`;
  - `test_create_then_patch_draft`;
  - `test_patch_kept_refused`;
  - `test_keep_records_history_row` (`CopilotAudit` kind `keep_cover` with a non-empty inverse);
  - `test_targets_groups_series_and_marks_in_use`;
  - `test_unknown_design_404` (a random UUID);
  - `test_allowance_get` (limit 20, left 20 on a fresh month).
- [ ] **Step 2: Run them.** `make test-app APP=media`. Expected: FAIL.
- [ ] **Step 3: Implement** the views, serializers, urls and the GET branch on generate.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(media): the designs API and the new-photo allowance"`

### Task 5: Courses and events carry their kept cover

**Files:**
- Modify: `backend/apps/courses/serializers.py` (the two serializers with
  `thumbnail_signed_url`, at lines ~95 and ~165).
- Modify: `backend/apps/live/serializers.py` (`LiveClassSerializer`, `LiveStreamSerializer`,
  `ZoomClassSerializer`, `OnsiteEventSerializer`, `CalendarEventSerializer`).
- Modify: `backend/apps/live/views.py`: `_to_calendar_event` adds `"cover_design": cover_for(obj, ctx)`,
  with one `ctx` dict per request.
- Modify: `frontend-customer/src/types/api-generated.ts` (`cd frontend-customer && npm run gen:api`).
- Test: `backend/apps/courses/tests/test_cover_design.py`, `backend/apps/live/tests/test_cover_design.py`

**Interfaces:**
- Produces: `cover_design: CoverDesign | null` on every course and event payload, from
  `designs.cover_for(obj, self.context)`.

- [ ] **Step 1: Write the failing tests:**
  - `test_course_payload_has_cover_design_after_keep` (list and detail);
  - `test_calendar_event_has_cover_design` (`/api/v1/calendar/`).
- [ ] **Step 2: Run them.** `make test-app APP=courses` and `make test-app APP=live`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `cover_design = serializers.SerializerMethodField()` and its getter
  in each serializer.
- [ ] **Step 4: Run the tests again,** then `npm run gen:api`. Review the diff: only
  `cover_design` additions are expected.
- [ ] **Step 5: Commit.** `git commit -m "feat: courses and events carry their kept cover design"`

### Task 6: The cover model in TypeScript: palette, layouts, words

**Files:**
- Create: `frontend-customer/src/types/design.ts`, the recipe of Task 2 and:
  - `CoverSize`, `LayoutId`, `PartId`, `PaintRole`, `Paint`, `Frame`, `PartStyle`, `Extra`;
  - `CoverDesign = {id, recipe, photos, logo_url, look}`;
  - `CoverItem = {title: string; createdAt?: string | null; startsAt?: string | null}`.
- Create: `frontend-customer/src/lib/covers/palette.ts`, `layouts.ts`, `recipe.ts`
- Modify: `frontend-customer/src/types/course.ts` and `src/types/live.ts`:
  `cover_design?: CoverDesign | null`.
- Test: `frontend-customer/src/lib/covers/__tests__/palette.test.ts`, `layouts.test.ts`, `recipe.test.ts`

**Interfaces:**
- `palette.ts`:
  - `coverPalette(style: SiteStyle, paletteId?: string | null): Record<PaintRole, string>` uses the
    look's own palette (never `modePalette`). Roles:
    - `primary`, `accent`;
    - `ink` = foreground, `paper` = background, `surface`;
    - `inverse`, `inverse-ink` = inverseForeground;
    - `primary-light`, `primary-dark`, `accent-light`, `accent-dark`: oklch lightness ±0.16,
      clamped to 0.08–0.96, same chroma and hue;
    - `white`, `black`.
  - `paintColor(paint: Paint, palette): string`, with `primary` as the fallback for an unknown
    role.
  - `readableOn(paint: Paint, palette): string`: `palette.ink` when the paint's oklch L > 0.62,
    else `#fff`.
- `layouts.ts`:
  - `LAYOUTS: LayoutId[]`.
  - `aspectClass(aspect: number): "portrait"|"square"|"landscape"|"banner"`, with boundaries 0.95,
    1.2 and 2.4.
  - `layoutFrames(layout: LayoutId, aspect: number): Record<PartId, Frame | null>`.
  - `textSize(layout: LayoutId, part: "label"|"title"|"subtitle"|"badge", aspect: number): number`,
    in `cqmin`.
  - Intent per layout:

    | Layout | Arrangement |
    |---|---|
    | `panel` | Photo on one side: right in landscape and banner (banner photo ≥ 60%), top in portrait and square. A colour panel on the other side, words stacked at its bottom, logo at its top, badge on the photo's top corner. |
    | `full` | Photo fills, words bottom-left on a darkening, logo top-left, badge top-right. |
    | `title` | Colour field fills, words centred, logo top centre, no photo. |
    | `band` | Photo with a colour band holding the words: bottom 34% in portrait, square and landscape; left 38% in banner. |
    | `framed` | Colour field fills, the photo inset, words beside it (landscape, banner) or below it (portrait, square). |
    | `photo` | Photo fills, no words, logo and badge allowed. |

- `recipe.ts`:
  - `SIZES: CoverSize[]`.
  - `sizeAspect(size: CoverSize, cardAspect: CoverAspect): number`.
  - `nearestSize(frameAspect: number, cardAspect: CoverAspect): CoverSize`, by smallest
    |log(ratio)|.
  - `framesFor(recipe: CoverRecipe, size: CoverSize, cardAspect: CoverAspect): Record<string, Frame>`:
    layout frames, then extras' frames, then that size's overrides.
  - `defaultRecipe(opts: {layout?: LayoutId; photoId?: string | null; set?: CoverRecipe | null}): CoverRecipe`.
  - `fromSet(kept: CoverRecipe): Pick<CoverRecipe, "layout"|"panel"|"styles"|"badge"|"logo">`.
  - `nearestGenerationAspect(card: CoverAspect): "16:9"|"1:1"|"4:3"|"9:16"|"4:5"`, the
    generation endpoint's aspect closest to Card.
  - `resolveWords(recipe, item: CoverItem, now: Date): {label: string; title: string; subtitle: string; badge: string | null}`:
    - `new` gives "New" within 30 days of `createdAt`;
    - `date` gives a short "Nov 2" date from `startsAt`, or null when it is past or missing;
    - `live` gives "Live";
    - `text` gives `badge.text`;
    - `none` gives null.

- [ ] **Step 1: Write the failing tests:**
  - `palette`: roles exist for every look, light and dark tones differ from the base, a hex passes
    through, an unknown role falls back.
  - `layouts`: for every layout × each aspect in [0.75, 1, 1.333, 1.778, 3]:
    - every frame lies within [0,1];
    - in `panel`, the text frames do not intersect the photo frame;
    - at aspect 3 the `panel` photo frame has w ≥ 0.6;
    - `textSize(...,"title",...) * min(300, 300/aspect) / 100 ≥ 16` (readable at a 300 px wide frame).
  - `recipe`:
    - `nearestSize(1.33,"4/3")` is "card", `nearestSize(2,"4/3")` is "wide",
      `nearestSize(3.5,"4/3")` is "banner";
    - the title binds to the item's title when null;
    - `new` expires after 30 days;
    - `date` returns null for a past start;
    - an override replaces only its own size's frame;
    - `nearestGenerationAspect("3/4")` is `"4:5"` and `nearestGenerationAspect("16/10")` is `"16:9"`.
- [ ] **Step 2: Run them.** `cd frontend-customer && npx vitest run src/lib/covers`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules and the types.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(covers): palette, layouts and words for a cover recipe"`

### Task 7: `CoverArt`, one renderer for every place

**Files:**
- Create: `frontend-customer/src/components/covers/cover-art.tsx`,
  `frontend-customer/src/components/covers/cover-art.module.css`,
  `frontend-customer/src/components/covers/look-fonts.tsx`
- Test: `frontend-customer/src/components/covers/__tests__/cover-art.test.ts` (no JSX in `.test.ts`:
  build elements with `createElement`; no testing-library is installed)

**Interfaces:**
- `CoverArt(props: {design: CoverDesign; item: CoverItem; mode?: "full" | "bare"; size?: CoverSize; photoClassName?: string; className?: string; now?: Date})`
  - No hooks; it is safe in server components. It fills its positioned parent
    (`position:absolute; inset:0`).
  - It renders one wrapper per size. `size` forces one size; without it, the module's container
    queries show the nearest.
  - The root carries `container-type: size` and a card-shape class `card_34 | card_45 | card_11 |
    card_43 | card_32 | card_1610`. Each class defines the two thresholds: the geometric means of
    the card aspect with 16/9, and of 16/9 with 3/1.
  - `@container (max-width: 179px)` hides `[data-words]`, the badge and the logo.
- Layers:
  - **Photo**: an `<img>` with `object-fit: cover`, `object-position` from `focus`, `scale(zoom)`,
    and `filter: brightness() contrast() saturate()`, plus a darken overlay. `photoClassName` goes
    on the `<img>`. A missing URL draws the same tinted placeholder as `Img`.
  - **Text**: font family `'<display>'` or `'<body>'` from the look, size `calc(<textSize> * <scale> * 1cqmin)`,
    `text-wrap: balance`, and a line clamp of 1 (label), 3 (title) or 3 (subtitle).
  - **Colours**: from `coverPalette` of `design.look`; text defaults to `readableOn(panel)`.
  - **Logo**: `logo_url` as an `<img>`, tinted by its part style colour: `white` gives
    `brightness(0) invert(1)`, `black` gives `brightness(0)`, anything else the original.
- `LookFonts({look}: {look: string})` renders `<link rel="stylesheet" href={styleFontsHref(style)}>`
  for screens where the tenant theme is off (`/admin`).

- [ ] **Step 1: Write the failing tests** (render with `renderToStaticMarkup`):
  - three `[data-size]` wrappers without `size`, one with `size="banner"`;
  - `mode="bare"` renders no `[data-words]` and no badge;
  - a null title renders the item's title;
  - a missing photo URL renders `[data-empty-image]` (Review Focus 2);
  - the title element's style carries `-webkit-line-clamp: 3` (Review Focus 3);
  - the root class matches `card_34` for an atelier look.
- [ ] **Step 2: Run them.** `npx vitest run src/components/covers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(covers): CoverArt draws a design at any size"`

### Task 8: Every cover slot draws designs

**Files:**
- Modify: `frontend-customer/src/components/sections/kit.tsx`:
  - `ImageValue` gains `design?: CoverDesign | null`, `item?: CoverItem` and
    `mode?: "full" | "bare"`;
  - `Img` renders `<CoverArt>` inside its frame when `value.design` is set, passing `imgClassName`
    as `photoClassName`;
  - add `courseCover(c: Course, mode?: "full"|"bare"): ImageValue` and
    `eventCover(e: CalendarEvent, mode?): ImageValue`.
- Modify: every `value={{ url: courseImage(c) }}` call site, about 25 across
  `components/sections/*/courses.tsx`, `grid/course-showcase.tsx` and `rows.tsx`. Use `courseCover(c)`,
  or `courseCover(c, "bare")` for kinetic's Poster.
- Modify: `components/sections/rows.tsx`: `Billboard` and `Tile` take `image: ImageValue`, and the
  four call sites pass `courseCover(…, "bare")` and `eventCover(…, "bare")`.
- Modify: `components/public/course-card.tsx` (`overlay` variant bare, others full),
  `app/(public)/courses/[slug]/page.tsx`, `components/public/calendar/event-detail-client.tsx`,
  `components/public/events/events-list.tsx`, `components/public/events-catalog-client.tsx`,
  `app/(student)/dashboard/page.tsx` and `app/admin/courses/page.tsx`. Each draws through `Img`, or
  through `CoverArt` in a positioned box where it renders its own `<img>` today.
- Test: `frontend-customer/src/components/sections/__tests__/img-design.test.ts` (next to
  `kit-contract.test.ts`; `createElement` + `renderToStaticMarkup`)

- [ ] **Step 1: Write the failing tests:**
  - `Img` with `{url, design}` renders `[data-cover]` and no bare `<img src=url>` outside it;
  - `courseCover(courseWithoutDesign)` equals `{url, design: null, item, mode: "full"}`;
  - rows' Billboard renders bare.
- [ ] **Step 2: Run them.** `npx vitest run src/components/sections`. Expected: FAIL.
- [ ] **Step 3: Implement** and update the call sites. `grep -rn "courseImage(" src` must then
  show only `kit.tsx` and the `courseCover` body.
- [ ] **Step 4: Run the tests again,** then `make typecheck` and `make test-frontend`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(covers): every cover slot draws a kept design"`

### Task 9: The studio's client and its edit reducer

**Files:**
- Create: `frontend-customer/src/lib/designs-api.ts`, `frontend-customer/src/lib/covers/editor.ts`
- Modify: `frontend-customer/src/lib/curated-images-api.ts`: add `generationAllowance()`,
  `startGeneration(prompt: string, aspect: "16:9"|"1:1"|"4:3"|"9:16"|"4:5")` and
  `generationStatus(jobId: string)`.
- Test: `frontend-customer/src/lib/covers/__tests__/editor.test.ts`

**Interfaces:**
- `designs-api.ts`:
  - `getTargets()`, `listDesigns(state?)`, `getDesign(id)`;
  - `openDesign(body: {target_kind: string; target_key: string; recipe?: CoverRecipe; from?: string})`;
  - `saveDesign(id, recipe)`, `deleteDesign(id)`, `keepDesign(id): Promise<{result; audit_id: number | null}>`.

  All go through `clientFetch`; types come from Task 6.
- `editor.ts`:
  - `type EditorAction = | {type:"layout"; layout} | {type:"photo"; id} | {type:"photoAdjust"; patch} | {type:"words"; patch} | {type:"badge"; patch} | {type:"panel"; paint} | {type:"style"; part; patch} | {type:"logo"; on} | {type:"applySet"; set} | {type:"frame"; size; id; frame} | {type:"addExtra"; extra} | {type:"updateExtra"; id; patch} | {type:"remove"; id} | {type:"duplicate"; id} | {type:"order"; id; dir: "forward"|"back"}`.
  - `applyEdit(recipe: CoverRecipe, action: EditorAction): CoverRecipe` is pure.
  - `coalesceKey(action): string | null`: words and sliders coalesce by part or field; layout,
    photo and adds do not.
  - History uses `createHistory`, `push`, `undo` and `redo` from `lib/logo/history.ts`.
  - Removing a fixed part hides it (a `styles[part].hidden` flag, added to the Task 2 and Task 6
    shape); removing an extra deletes it. `order` moves extras only.

  `ponytail: fixed parts keep a fixed stacking order; extras stack above them in array order — free z-order for parts if she asks.`

- [ ] **Step 1: Write the failing tests:**
  - layout change keeps words and photo;
  - `remove` hides a part and deletes an extra;
  - `duplicate` offsets the copy by 0.03;
  - `order` swaps extras;
  - `frame` writes only that size's override;
  - typing `words` five times coalesces into one undo step.
- [ ] **Step 2: Run them.** `npx vitest run src/lib/covers/__tests__/editor.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): the studio's API client and edit reducer"`

### Task 10: Site → Photo studio, and the doors to it

**Files:**
- Create: `frontend-customer/src/app/admin/studio/page.tsx`, `app/admin/studio/loading.tsx`,
  `frontend-customer/src/components/studio/studio-list.tsx`,
  `frontend-customer/src/lib/covers/open-studio.ts`, `frontend-customer/src/lib/covers/targets.ts`
- Modify:
  - `frontend-customer/src/lib/admin-nav.ts`: `item("studio", "/admin/studio", Images)` in the
    `site` section, after `media`;
  - `messages/en/admin.json`: `nav.items.studio` = "Photo studio", plus a `studio` namespace for
    this page's copy;
  - `frontend-customer/src/components/admin/course-form.tsx`: a "Design a cover" button beside the
    Thumbnail picker, when editing;
  - `frontend-customer/src/components/admin/live/event-form.tsx`: a Cover row showing the current
    cover with "Design a cover", when editing;
  - `e2e/impact-map.json`: add `32-photo-studio` to backend `media`, and add frontend entries
    `src/app/admin/studio`, `src/components/studio`, `src/components/covers` and `src/lib/covers`.
- Test: `frontend-customer/src/lib/__tests__/admin-nav.test.ts` (existing): the `site` section lists
  `studio`. `frontend-customer/src/lib/covers/__tests__/targets.test.ts`: `targetState(target)`.

**Interfaces:**
- `openCoverStudio(target: {target_kind: string; target_key: string}, navigate: (href: string) => void): Promise<void>`
  calls `openDesign` and navigates to `/admin/studio/<id>`.
- The list page shows "Courses" and "Classes & events" (series). Each row shows its cover:
  `CoverArt` at Wide in a 16:9 box with `LookFonts`, else the photo, else an empty tile. It also
  shows the title, a state ("Designed", "Photo", "No cover", "Draft waiting") and one action
  ("Design a cover", "Continue", or "Edit a copy", which calls `openDesign({from: keptId})`).
  `PageState` holds the skeleton from `components/ui/skeletons`.

- [ ] **Step 1: Write the failing tests.** The nav test expects `studio` under `site`.
  `targetState(target): "designed"|"photo"|"none"|"draft"` gives "draft" when `draft_id` is set,
  "designed" when `cover` is set, "photo" when only `photo_url` is set, else "none".
- [ ] **Step 2: Run them.** `npx vitest run src/lib/__tests__/admin-nav.test.ts src/lib/covers`.
  Expected: FAIL.
- [ ] **Step 3: Implement** the page, the nav item, the copy and the two form doors.
- [ ] **Step 4: Run it again,** then `make lint`. The loading-pattern and e2e selector checks must
  be clean. Check `/admin/studio` in the running dev stack at desktop and phone width.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): Site → Photo studio lists every cover"`

### Task 11: The editor, simple controls (every screen in Part A)

**Files:**
- Create:
  - `frontend-customer/src/app/admin/studio/[id]/page.tsx`, `app/admin/studio/[id]/loading.tsx`;
  - `frontend-customer/src/components/studio/studio-editor.tsx`: state, history, 800 ms autosave,
    Keep, Discard;
  - `frontend-customer/src/components/studio/simple-controls.tsx`;
  - `frontend-customer/src/components/studio/photo-sources.tsx`: the Yours, Contentor and New tabs,
    shared with the Part B drawer;
  - `frontend-customer/src/components/studio/size-previews.tsx`;
  - `frontend-customer/src/components/studio/covers-strip.tsx`;
  - `frontend-customer/src/lib/covers/autosave.ts`.
- Modify: `messages/en/admin.json` (`studio` namespace).
- Test: `frontend-customer/src/lib/covers/__tests__/autosave.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7 and 9.
- `StudioEditor({designId}: {designId: string})`:
  - It loads `getDesign` and `getTargets`, and keeps `EditHistory<CoverRecipe>`.
  - It autosaves through `saveDesign` (800 ms debounce; a pending save flushes on unmount).
  - Keep calls `keepDesign`, then a toast: "Kept. <title> now uses this cover." with an Undo
    action that calls `undoCopilotAction(audit_id)` from `lib/copilot/api.ts`.
  - Discard calls `deleteDesign`, then navigates back to `/admin/studio`.
  - A kept or retired design opens read-only with "Edit a copy".
- `SimpleControls`, in this order:
  - **Words**: label, title, subtitle; the title field placeholder is the item's title, and empty
    means "follow the title".
  - **Photo**: `PhotoSources`.
  - **Layout**: "Your set" first when a kept design exists (`fromSet`), then the six layouts.
  - **Colour**: palette swatches from `coverPalette`, plus a hex input.
  - **Badge**: kind select, text when `text`.
  - **Logo**: toggle.
  - **Size**: Card, Wide or Banner, which picks the preview shown large.
- `PhotoSources({cardAspect, inUse, generationsLeft, onPick(photo: {id: string; url: string})})`:
  - **Yours**: `/api/v1/photos/?search=` with Upload through `uploadPhoto` from `lib/upload.ts`.
  - **Contentor**: `searchCuratedImages`. A result in `inUse` shows "In use on <title>". Picking
    one calls `materializeCuratedImage` first.
  - **New**: a prompt, "Make it" and "<n> new photos left this month". It calls `startGeneration`
    with the nearest supported aspect to Card and polls `generationStatus` every 2 s until done,
    with a shimmer in the photo slot. The tab is disabled when `generationsLeft` is 0.
  - Search refinements wrap results in `<StaleContainer>`.

- [ ] **Step 1: Write the failing test** for
  `createAutosave(save: (r: CoverRecipe) => Promise<void>, delay = 800): {schedule(r: CoverRecipe): void; flush(): Promise<void>; cancel(): void}`
  (vitest fake timers): three `schedule` calls within 800 ms save once with the last recipe;
  `flush()` saves the pending recipe at once; `cancel()` drops it; a failed save keeps the recipe
  pending for the next `flush()`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the editor page and its pieces.
- [ ] **Step 4: Run the tests and the checks:** `make test-frontend`, `make typecheck`, `make lint`.
  Then, in the running dev stack (`make health-check` first):
  - design a cover for a demo-yoga course from Yours (an uploaded photo);
  - Keep it;
  - see it on `/courses/<slug>` (Banner), on the home courses section (Card) and on the admin
    courses grid (Wide);
  - Undo it from the toast;
  - check desktop and phone width, light and dark, and the atelier and encore looks.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): design a cover with simple controls, keep it, undo it"`

### Task 12: e2e for Part A, then ship Part A

**Files:**
- Create: `e2e/specs/32-photo-studio.spec.ts`

- [ ] **Step 1: Write the spec.** Use `coachContext` (`e2e/helpers/auth.ts`) on `demo-yoga`:
  - open `/admin/studio`;
  - "Design a cover" on the first course;
  - type a title;
  - choose the "Title only" layout (no photo search, so no catalog credits);
  - Keep;
  - expect the toast;
  - open the course page and expect `[data-cover]` with the typed title;
  - undo through the toast;
  - expect the course page without `[data-cover]`.
- [ ] **Step 2: Run it.** `make e2e-spec SPEC=32-photo-studio`. Expected: PASS. Fix the product,
  not the spec, on a real failure.
- [ ] **Step 3: Run the full suite once:** `make test-changed`, then `make e2e-changed`. Only one
  heavy job at a time.
- [ ] **Step 4: Commit,** then ship Part A:
  - `git commit -m "test(e2e): design, keep and undo a cover"`;
  - typecheck the committed tree fresh in a deploy worktree (memory
    `reference-typecheck-the-committed-tree`);
  - `make deploy`;
  - verify on prod: `/api/health/`, `/api/v1/designs/targets/` returns 401 or 403 anonymously,
    and a tenant's course page still renders its photo cover.

## Part B — the desktop canvas (Canva-style)

### Task 13: The canvas: select, move, resize, edit in place

**Files:**
- Create: `frontend-customer/src/components/studio/studio-canvas.tsx`,
  `frontend-customer/src/components/studio/layer-toolbar.tsx`,
  `frontend-customer/src/lib/covers/geometry.ts`
- Test: `frontend-customer/src/lib/covers/__tests__/geometry.test.ts`

**Interfaces:**
- `geometry.ts`, all pure:
  - `moveFrame(frame: Frame, dx: number, dy: number): Frame`;
  - `resizeFrame(frame: Frame, handle: "nw"|"ne"|"sw"|"se"|"n"|"e"|"s"|"w", dx: number, dy: number, keepRatio: boolean): Frame`
    (minimum w and h 0.02);
  - `snap(frame: Frame, guides: number[] = [0, 0.5, 1], tolerance = 0.012): {frame: Frame; guides: {x?: number; y?: number}}`;
  - `hitTest(frames: Record<string, Frame>, x: number, y: number, order: string[]): string | null`.
- `StudioCanvas({recipe, design, size, cardAspect, selected, onSelect, onEdit})` draws
  `<CoverArt size={size}>` and an overlay of hit boxes from `framesFor`:
  - Drag with pointer capture dispatches `{type:"frame", size, id, frame}`.
  - Handles resize; Shift keeps the ratio.
  - Arrows nudge 0.005 (Shift: 0.02).
  - Delete removes, Cmd-D duplicates, Escape deselects.
  - A double-click on a text layer edits it in place (a `contentEditable` over the frame); the
    commit dispatches `words` or `updateExtra`.
  - Patterns come from `components/logo/studio-canvas.tsx`, generalised to many layers.
- `LayerToolbar({part|extra, recipe, palette, onEdit})`:
  - **text**: font role, size scale, weight, upper case, tracking, leading, align, colour;
  - **photo**: focus (drag inside the frame with Alt, or two sliders), zoom, brightness, contrast,
    saturation, darken;
  - **badge**: kind, text, fill;
  - **shape**: shape, fill, opacity;
  - **all**: forward and back (extras), duplicate, delete.

- [ ] **Step 1: Write the failing tests** for `geometry.ts`:
  - resize from `nw` moves the origin and keeps the opposite corner;
  - a ratio-locked resize keeps w/h;
  - snapping to 0.5 within tolerance reports the guide;
  - `hitTest` returns the top-most frame.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** geometry, the canvas and the toolbar.
- [ ] **Step 4: Run the tests again,** then a dev-stack check:
  - drag the title, resize the badge and undo both;
  - switch to Banner, nudge the logo, and see that Card is unchanged.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): select, move, resize and edit layers on the canvas"`

### Task 14: The desktop editor: rail, drawers, strip

**Files:**
- Create: `frontend-customer/src/components/studio/studio-rail.tsx`,
  `frontend-customer/src/components/studio/drawers/{layouts,photos,text,elements,brand,uploads}.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx`: the sidebar shows icons only
  while `isStudioEditor(pathname)` (from `frontend-customer/src/lib/covers/routes.ts`: true for
  `/admin/studio/<id>`, false for `/admin/studio`).
- Modify: `frontend-customer/src/components/studio/studio-editor.tsx`. At `lg` and up it renders the
  mockup's layout:
  - top bar: the item, a size switcher, Undo and Redo, Keep;
  - rail;
  - drawer;
  - canvas with `LayerToolbar` above it;
  - covers strip under the canvas.

  Below `lg` it keeps `SimpleControls`.

**Interfaces:**
- Rail tools: `layouts`, `photos`, `text`, `elements`, `brand`, `uploads` and `generate`
  ("New photo" opens Photos on its New tab).
- `drawers/photos.tsx` wraps `PhotoSources` (Task 11).
- `drawers/text.tsx` adds text extras: "Add a title", "Add a subtitle", "Add a line of text".
- `drawers/elements.tsx` adds badge extras ("New", "Live", "Next date" sets the fixed badge; her
  own words adds an extra) and shape extras (rect, circle, arch, line).
- `drawers/brand.tsx`:
  - logo toggle;
  - the `coverPalette` swatches, which apply to the selected layer's colour, or to the panel when
    nothing is selected;
  - the look's two fonts, which apply to the selected text layer.
- `drawers/uploads.tsx`: drop zone through `uploadPhoto`; a dropped photo goes onto the canvas.
- The covers strip shows her other covers (`getTargets`) through `CoverArt`.

- [ ] **Step 1: Write the failing test** `frontend-customer/src/lib/covers/__tests__/routes.test.ts`:
  `isStudioEditor` for `/admin/studio/abc` (true), `/admin/studio` (false) and `/admin/media` (false);
  and `STUDIO_TOOLS` (also in `lib/covers/routes.ts`) lists the seven tools with `layouts` first.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the rail, drawers and desktop layout.
- [ ] **Step 4: Run the tests and the checks:** `make test-frontend`, `make typecheck`, `make lint`.
  Then a dev-stack check against the approved mockup: at 1440 px the layout matches the mockup's
  regions; at 1023 px the simple controls show; light and dark.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): the desktop editor, with rail and drawers"`

### Task 15: e2e for Part B, then ship Part B

**Files:**
- Modify: `e2e/specs/32-photo-studio.spec.ts`

- [ ] **Step 1: Extend the spec** (desktop viewport): open a draft, drag the title layer 40 px,
  press Cmd-Z, and expect the title back at its first position; add a "New" badge from Elements
  and expect it on the canvas.
- [ ] **Step 2: Run it.** `make e2e-spec SPEC=32-photo-studio`. Expected: PASS.
- [ ] **Step 3: Run the changed suites:** `make test-changed`, then `make e2e-changed`, one after
  the other.
- [ ] **Step 4: Commit and ship Part B** (as Task 12 Step 4).
