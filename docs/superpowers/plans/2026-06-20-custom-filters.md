# Custom Faceted Filters (Courses & Events) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (chosen: inline, per-task commits). Steps use checkbox (`- [ ]`).

**Goal:** A coach-defined faceted filter system (`FilterGroup` → `FilterOption`) tagging Courses + 4 event models (M2M), with admin CRUD + list-filtering, per-block facet selection in the site builder, public facet pills, and full removal of `CourseCategory`.

**Tech Stack:** Django 5.1 + DRF + django-tenants, adminkit, Next.js 14 + TS.

## Global Constraints

- New app `apps.filters` in TENANT_APPS. Per-model M2M `filter_options` to
  `FilterOption` (no contenttypes).
- Replace, don't keep, `CourseCategory` — forward migration drops it.
- Tenant migrations: `make makemigrations` + `make migrate`. No backfill.
- Category/filter write endpoints: `IsCoachOrOwner`. Token-only frontend.
- Commit per task. Local `main` only — no push/deploy. Stack is up.
- Dev cmds in container: `docker compose exec -T django python manage.py …`,
  `docker compose exec -T django pytest …`, tsc via
  `docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit'`.

---

### Task 1: `apps.filters` app + models + migration

- [ ] Create `backend/apps/filters/{__init__,apps,models,serializers,views,urls,admin_panels}.py` + `migrations/__init__.py`. `AppConfig(name="apps.filters")`.
- [ ] `FilterGroup` (name, unique slug, `applies_to` ∈ course/event/both default both, order, created_at; `save()` slugifies+uniques; `__str__`). `FilterOption` (group FK related_name="options", name, slug, order; `UniqueConstraint(group, slug)`; `save()` slugifies + uniques within group). Both `ordering=["order","name"]`.
- [ ] Add `"apps.filters"` to `TENANT_APPS` in `config/settings/base.py`.
- [ ] `makemigrations filters` → `0001`. **Don't migrate yet** (Task 3 adds the M2M migration; migrate together).
- [ ] Commit.

### Task 2: Filters serializers + CRUD endpoints

- [ ] `FilterOptionSerializer` (id, name, slug, order, group, `group_name`=source group.name, `group_slug`=source group.slug; read-only id/slug). `FilterGroupSerializer` (id, name, slug, applies_to, order, `options`=FilterOptionSerializer(many, read_only); read-only id/slug).
- [ ] Views (`IsCoachOrOwner`): `group_list_create` (GET `?applies_to=` filter incl. `both`; POST), `group_detail` (GET/PUT/DELETE), `option_list_create` (POST `{group,name,order?}`), `option_detail` (GET/PUT/DELETE).
- [ ] `apps/filters/urls.py`: `groups/`, `groups/<pk>/`, `options/`, `options/<pk>/`. Include in `config/urls.py` as `path("api/v1/filters/", include("apps.filters.urls"))`.
- [ ] Commit.

### Task 3: M2M on Course + 4 events; remove CourseCategory model; migrations

- [ ] `apps/courses/models.py`: delete `CourseCategory`; remove `Course.categories`; add `Course.filter_options = M2M("filters.FilterOption", blank=True, related_name="courses")`.
- [ ] `apps/live/models.py`: add `filter_options = M2M("filters.FilterOption", blank=True, related_name=<live_classes|live_streams|zoom_classes|onsite_events>)` to the 4 models.
- [ ] `makemigrations courses live` (courses: DeleteModel CourseCategory + RemoveField categories + AddField filter_options; live: 4 AddField). Then `migrate_schemas`.
- [ ] Commit (models + migrations).

### Task 4: Course serializers/views — swap categories → filter_options; remove category API

- [ ] `apps/courses/serializers.py`: remove `CourseCategorySerializer` + `categories`/`category_ids`. Import `FilterOptionSerializer` from `apps.filters.serializers`. CourseList/Detail: `filter_options = FilterOptionSerializer(many=True, read_only=True)` (+ in fields). CourseCreateUpdate: `filter_option_ids = PrimaryKeyRelatedField(many=True, queryset=FilterOption.objects.all(), source="filter_options", required=False)` (+ in fields).
- [ ] `apps/courses/views.py` + `urls.py`: remove `category_list_create`/`category_detail` + their routes + imports.
- [ ] Commit.

### Task 5: Event serializers + calendar feed surface filter_options

- [ ] The 4 read serializers: add `filter_options = FilterOptionSerializer(many=True, read_only=True)`. The 4 create serializers: add `filter_option_ids` (source="filter_options").
- [ ] `apps/live/views.py` `_to_calendar_event`: include `obj.filter_options` (serialized via `FilterOptionSerializer`); prefetch `filter_options` on each of the 4 querysets in `calendar_events`. `CalendarEventSerializer`: add `filter_options` field.
- [ ] Commit.

### Task 6: Adminkit — register filters, list_filters, M2M-filter core support

- [ ] `apps/filters/admin_panels.py`: register `FilterGroup` (fields name/applies_to/order; list_display name/applies_to/order/option_count via admin method) + `FilterOption` (fields group/name/order; list_display name/group/order; search name).
- [ ] `apps/courses/admin_panels.py`: remove `CourseCategoryAdmin`; add `"filter_options"` to `CourseAdmin.list_filters`. The 4 event admins (find them — likely `apps/live/admin_panels.py`): add `"filter_options"` to `list_filters`.
- [ ] Adminkit core: in `introspection.field_schema`/`filter_schema`, detect a many-related serializer field and emit a `choice` filter whose `choices` are the related options `(id, str)`; in `views.filter_queryset`, `.distinct()` when an M2M filter applied. Keep backward-compatible.
- [ ] Commit.

### Task 7: Backend tests

- [ ] `apps/filters/tests/test_filters.py`: model slug/uniqueness (option unique per group); group/option CRUD (coach 201 / student 403); `applies_to` list filter.
- [ ] `apps/courses/tests`: replace category tests with filter_option round-trip + list serializer includes filter_options.
- [ ] `apps/live/tests`: event create round-trips filter_option_ids; calendar feed includes filter_options.
- [ ] Adminkit test: course list filtered by `?filter_options=<id>` returns only tagged.
- [ ] `pytest apps/filters apps/courses apps/live apps/adminkit -q` green.
- [ ] Commit.

### Task 8: Frontend types + remove category-picker

- [ ] `types/course.ts`: remove `CourseCategory` + `Course.categories`; add `FilterOption { id, name, slug, order?, group, group_name, group_slug }`, `FilterGroup { id, name, slug, applies_to, order, options: FilterOption[] }`; add `filter_options?: FilterOption[]` to `Course`. Add same to the events/calendar type.
- [ ] Delete `components/admin/category-picker.tsx`.
- [ ] Commit with Task 9/10.

### Task 9: `FilterPicker` component

- [ ] `components/admin/filter-picker.tsx`: props `{ value: number[]; onChange; scope: "course" | "event" }`. Loads `GET /api/v1/filters/groups/?applies_to=<scope>`; renders selections as chips grouped by Filter; toggle options; create-option-inline within a group (`POST /api/v1/filters/options/ {group, name}`). Token-only (Badge chips).
- [ ] Commit.

### Task 10: Course form uses FilterPicker

- [ ] `course-form.tsx`: replace `CategoryPicker`/`categoryIds`/`category_ids` with `FilterPicker scope="course"` + `filterOptionIds` + `filter_option_ids` in create+update bodies; seed from `course.filter_options`.
- [ ] tsc clean. Commit.

### Task 11: Event forms use FilterPicker (×4)

- [ ] Find the 4 event admin forms (in `app/admin/live*`/components). Add `FilterPicker scope="event"` + `filter_option_ids` to each create/update payload, seeded from the event's `filter_options`.
- [ ] tsc clean. Commit.

### Task 12: Block config — `filterGroups` field + renderer control

- [ ] `lib/blocks/field-schema.ts`: add `"filterGroups"` to `FieldType` + optional `filterScope?: "course" | "event"`.
- [ ] `components/owner/field-renderer.tsx`: add a `case "filterGroups"` control that fetches groups for `field.filterScope` and renders checkboxes; value = `number[]` (group ids). Graceful when the coach has no groups.
- [ ] `registry.tsx`: add a `filterGroups` field (filterScope course) to `courseGrid` and (event) to `upcomingEvents`; `defaultData.filterGroups = []`.
- [ ] tsc clean. Commit.

### Task 13: Public course facets

- [ ] `course-grid-block.tsx`: pass `filterGroupIds={data.filterGroups}` to `CourseCatalogClient`.
- [ ] `course-catalog-client.tsx`: remove category pills; add faceted rendering — for each selected group id present among the items' `filter_options`, render a pill facet (its options). State `selected: Record<groupId, Set<optionId>>`. Filter: within-group OR, across-group AND, combined with pricing/search, gated by `showFilters`.
- [ ] tsc clean. Commit.

### Task 14: Public event facets

- [ ] `upcoming-events-block.tsx` + its client: same facet rendering driven by the block's `filterGroups`, reading each event's `filter_options`.
- [ ] tsc clean. Commit.

### Task 15: Verification

- [ ] `make migrate` applied; `pytest apps/filters apps/courses apps/live apps/adminkit -q` green; `tsc --noEmit` clean.
- [ ] Live: create a Filter+Options in admin; tag a course + an event; pick facets on a Courses block & an Events block → public facets filter (within-group OR / across-group AND); filter by option in the admin panel. CourseCategory fully gone (no 500s, no dangling UI).
- [ ] Leave dev stack up.

## Self-Review
- Covers: models+app (T1), API (T2,4,5), migrations+M2M+removal (T3), adminkit incl. M2M filter (T6), tests (T7), FE types/picker (T8,9), forms (T10,11), block config (T12), public facets (T13,14), verify (T15). ✓
- CourseCategory removed in T3 (model), T4 (API), T6 (admin), T8 (FE). ✓
- Naming Filter=FilterGroup, Option=FilterOption consistent. ✓
