# One-step creation flows + thumbnail preview fix — Design

Date: 2026-07-03
Status: approved (design), pending implementation

## Problem

1. **Course creation is 2-3 steps.** The create form at `/admin/courses/new` only
   exposes title / description / pricing / publish. Thumbnail and curriculum are
   hidden until after Create, when the coach is redirected to a second form
   ("Course Settings") and must save again. Coaches are non-technical; multi-phase
   creation reads as "the form lost my work."
2. **Broken thumbnail preview.** In `course-form.tsx`, `PhotoPicker.onSelect`
   stores `photo.s3_key` into `thumbnail_url` but discards `photo.signed_url`.
   The preview falls back to the raw key as `<img src>`, which the browser
   resolves relative to the page: `GET /admin/courses/demo/photos/fitness_3.jpg`
   → 404.
3. **Downloads create form is incomplete.** Paid price and tags can only be set
   by editing after creation (create form has title + pricing_type + file only).

Audit of all coach-side creation flows (2026-07-03): live classes, zoom classes,
onsite events, live streams, and bundles are already one-step. Bundles already
does a nested create (`items` in the POST body) — the precedent this design follows.

## Goals

- Creating a course — including thumbnail, filters, tags, and full curriculum
  (modules + lessons) — is ONE form and ONE submit, atomic on the backend.
- Every sub-object a form needs is creatable without leaving the form (see
  Design principle) — this holds for all creation flows, not just courses.
- Selecting a photo always shows a working preview.
- Creating a paid download with its price and tags is one submit.
- Edit flows are unchanged.

## Design principle (applies to every creation flow, current and future)

**A coach never has to leave a form to prepare something the form needs.**
Every sub-object a create/edit form references must be creatable in place:

- **Picker-managed objects** (photos, videos, tags, filter groups/options) —
  created inside the picker's modal or inline row. This is already true today:
  PhotoPicker/VideoPicker upload in-modal, TagInput has a "Create …" row,
  FilterPicker creates groups and options inline. Any NEW picker must ship with
  in-place creation from day one.
- **Owned child objects** (course modules/lessons) — composed in an expanding
  inline section of the parent's create form, held in local state, submitted
  with the parent in one atomic request (section 1 below).
- **Exception — references to existing top-level content** (e.g. bundle items
  pointing at courses/downloads): pickers select existing content only;
  inline-creating a whole course from inside a bundle form is out of scope.

Note the split: picker-managed objects are independent library objects and are
created via API the moment the coach makes them (an uploaded photo exists even
if the course form is abandoned — it lands in the media library, which is
correct). Owned children have no life without the parent, so they stay local
until the one atomic submit.

## Design

### 1. Backend — nested course create (atomic)

`CourseCreateUpdateSerializer` gains an optional write-only `modules` field:

```json
{
  "title": "...", "description": "...",
  "thumbnail_url": "...", "thumbnail": 12,
  "pricing_type": "paid", "price": "49.00", "is_published": false,
  "filter_option_ids": [1], "tag_ids": [2],
  "modules": [
    { "title": "Module A",
      "lessons": [
        { "title": "Lesson 1", "content_html": "", "is_free_preview": true, "video": 7 }
      ] }
  ]
}
```

- Nested serializers: module = `{title, lessons}`; lesson = the existing
  `LessonCreateSerializer` fields minus `order`.
- `order` is derived from list position (1-based) for both modules and lessons —
  clients do not send it.
- Creation runs inside `transaction.atomic()` in the serializer's `create()`:
  course + modules + lessons all-or-nothing.
- Validation errors surface with DRF's native nested indexing
  (`modules[1].lessons[0].video`), no custom error shape.
- PUT (update) path: `modules` is rejected on update (`if self.instance: raise
  ValidationError`) — curriculum editing stays on the existing per-module /
  per-lesson endpoints. Existing flat create requests (no `modules` key) behave
  exactly as before.
- View change: none beyond what the serializer absorbs (`_course_create`
  already returns `CourseDetailSerializer`, which includes nested modules).

### 2. Frontend — course create form shows everything

`course-form.tsx` create mode:

- Add to `createForm`: thumbnail (photo id + s3_key + signed preview url),
  and local curriculum state
  `modules: [{ tempId, title, lessons: [{title, content_html, is_free_preview, video, videoPreviewUrl}] }]`.
- Show the PhotoPicker, and a curriculum builder that reuses the existing
  module card + `LessonCreatePanel` UI but mutates local state (no API calls
  before submit). Add/remove modules, add/remove lessons; module/lesson order =
  array order.
- One "Create Course" click → single POST with the nested payload → redirect to
  `/admin/courses/{slug}` as today.
- Edit mode: unchanged (already single-page instant CRUD).

### 3. Thumbnail preview bug fix

- In `course-form.tsx` `onSelect`, also set
  `thumbnail_signed_url: photo.signed_url` so the preview uses the signed URL.
  (Create mode stores the same triple in `createForm`.)
- Guard in `PhotoPicker`: `displayUrl` must look like a URL
  (`/^(https?:)?\//` or `data:`/`blob:`) — otherwise render the placeholder
  icon instead of a broken `<img>`. Protects every current and future consumer
  from raw-s3-key regressions.

### 4. Downloads create form

Add to the create form, matching the fields already offered by inline edit:

- `price` input, shown when `pricing_type === "paid"`, sent on create.
- Tags (`TagInput`, scope `download`), sent as `tag_ids`.

The create POST already goes to `/api/v1/downloads/` which accepts these
fields (used by inline edit PATCH today) — frontend-only change.

## Error handling

- Backend nested create: any module/lesson error rolls back the whole course;
  the coach fixes the form and resubmits. No partial state.
- Frontend: on 400, show the toast and keep all local form state (no redirect).

## Testing

- Backend (`apps/courses/tests`): nested create happy path (orders 1..n,
  atomicity), empty `modules` list, missing lesson title → 400 + no course row,
  invalid video id → 400 + no course row, `modules` on PUT → 400,
  flat create (no `modules`) unchanged.
- E2e (`e2e/`): extend the course admin spec — create a course with thumbnail +
  1 module + 1 lesson in one submit; assert redirect to the course page shows
  the module/lesson; assert thumbnail preview `src` starts with `http`.
- Downloads: create a paid download with price + tag in one submit; assert the
  list row shows the price.

## Out of scope

- Reordering modules/lessons in the create form (array order only, no drag).
- The pre-existing `order=0` quirk: modules/lessons added later via the
  per-item endpoints default to `order=0` because the UI never sends `order`.
  Nested create being 1-based neither fixes nor worsens this.
- Changing edit-mode curriculum UX.
- Demo-seed data changes (seeded `thumbnail_url` keys are fine once previews
  use signed URLs / the PhotoPicker guard).
