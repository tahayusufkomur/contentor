# Custom faceted filters for Courses & Events — design

**Date:** 2026-06-20
**Status:** Approved, pending implementation plan
**Supersedes:** the `CourseCategory` taxonomy
(`2026-06-20-course-categories-*.md`) — that work is local-only and is **removed**
and replaced by this generic system.

## Summary

A coach-defined, **faceted** filter system that applies to **Courses and all
four Event types**. The coach creates **Filters** (dimensions, e.g. "Level",
"Style", "Language"), each with **Options** (e.g. "Beginner", "Vinyasa"). Any
course or event can be tagged with options (M2M). In the site builder the coach
picks, **per block**, which Filters to expose as facets; the public catalog/events
list then shows those facets and visitors combine them. The coach can also filter
items by these in the admin panel.

Decisions (brainstormed): faceted groups→options model; covers Courses +
LiveClass/LiveStream/ZoomClass/OnsiteEvent; coach curates which facets a block
exposes; replaces CourseCategory; built as **one** push. Naming: a group is a
**Filter** (`FilterGroup`), a value is an **Option** (`FilterOption`).

## Data model — new tenant app `apps.filters`

Add `apps.filters` to `TENANT_APPS` (after `apps.courses`/`apps.live`, but the
M2M references resolve by string so order is fine).

```python
class FilterGroup(models.Model):          # the coach-facing "Filter"
    name = models.CharField(max_length=100)          # "Level"
    slug = models.SlugField(max_length=120, unique=True)
    applies_to = models.CharField(
        max_length=10,
        choices=[("course", "Courses"), ("event", "Events"), ("both", "Both")],
        default="both",
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: ordering = ["order", "name"]
    # save(): slugify name, ensure unique (like Course)

class FilterOption(models.Model):         # the coach-facing "Option"
    group = models.ForeignKey(FilterGroup, related_name="options", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)          # "Beginner"
    slug = models.SlugField(max_length=120)
    order = models.IntegerField(default=0)
    class Meta:
        ordering = ["order", "name"]
        constraints = [UniqueConstraint(fields=["group", "slug"], name="uniq_option_slug_per_group")]
    # save(): slugify name, ensure unique within group
```

### Assignment — per-model M2M to `FilterOption`

Chosen over a generic content-type relation: the calendar feed already iterates
the five models explicitly, queries/serializers stay ergonomic, and it avoids
django-tenants + contenttypes edge cases.

- `Course.filter_options = M2M(FilterOption, blank=True, related_name="courses")`
- `LiveClass.filter_options` (related_name `live_classes`)
- `LiveStream.filter_options` (related_name `live_streams`)
- `ZoomClass.filter_options` (related_name `zoom_classes`)
- `OnsiteEvent.filter_options` (related_name `onsite_events`)

### Migrations

- `filters/0001` — FilterGroup, FilterOption.
- `courses` — **remove** CourseCategory model + `Course.categories`; **add**
  `Course.filter_options`.
- `live` — add `filter_options` to the four event models.

Run `make makemigrations` then `make migrate` (tenant migration; no backfill).

## Remove CourseCategory

Delete: the `CourseCategory` model + `Course.categories`; `CourseCategorySerializer`
and the `categories`/`category_ids` fields on course serializers;
`category_list_create`/`category_detail` views + their URLs; the adminkit
`CourseCategoryAdmin`; its tests. Frontend: `category-picker.tsx`, the `Course`
type's `categories`, and the catalog category pills. All replaced by the
equivalents below.

## API — `apps.filters`

Serializers:
- `FilterOptionSerializer`: `id, name, slug, order, group` (group = id) +
  `group_name`, `group_slug` (sourced) — so an item's embedded options carry
  their group for faceting.
- `FilterGroupSerializer`: `id, name, slug, applies_to, order, options`
  (nested `FilterOptionSerializer(many=True)`).

Endpoints (`/api/v1/filters/`, `@permission_classes([IsCoachOrOwner])`), routed
in `config/urls.py`:
- `groups/` (GET list — optional `?applies_to=course|event`; POST create),
  `groups/<pk>/` (GET/PUT/DELETE).
- `options/` (POST create `{group, name, order?}`), `options/<pk>/`
  (GET/PUT/DELETE). Creating an option needs only `{group, name}` →
  create-on-the-fly.

Course + event read serializers gain
`filter_options = FilterOptionSerializer(many=True, read_only=True)`. Their
create/update serializers gain
`filter_option_ids = PrimaryKeyRelatedField(many=True,
queryset=FilterOption.objects.all(), source="filter_options", required=False)`.

The calendar feed: `_to_calendar_event(obj, type, thumb)` adds
`obj.filter_options` serialized with `FilterOptionSerializer`, and
`CalendarEventSerializer` gains a `filter_options` field, so events carry their
options in the normalized feed (prefetch `filter_options` on each of the four
querysets).

## Adminkit

- Register `FilterGroup` and `FilterOption` panels (`@studio_site.register`),
  mirroring the existing pattern. `FilterOption`'s form includes its `group`
  (FK), so a coach manages options under a chosen filter.
- Add `"filter_options"` to `list_filters` on `CourseAdmin` and the four event
  admins so items can be filtered by an option in the admin panel.
- **Adminkit core enhancement:** `introspection.field_schema` / `filter_schema`
  currently render a many-related field as a text input. Extend them so an M2M
  list-filter is emitted as a `choice`-style filter whose choices are the related
  options (id → label). The apply logic (`views.filter_queryset`) already does
  `qs.filter(filter_options=<id>)`, which works for M2M; only the descriptor +
  control need the choices. Add `distinct()` when an M2M filter is active.

## Frontend

### Types
`FilterGroup { id, name, slug, applies_to, order, options: FilterOption[] }`,
`FilterOption { id, name, slug, order, group, group_name, group_slug }`. Course
and the calendar Event type carry `filter_options?: FilterOption[]`.

### Faceted picker (replaces `category-picker`)
A `FilterPicker` component: loads the coach's groups
(`GET /api/v1/filters/groups/?applies_to=<scope>`), shows current selections as
chips grouped by Filter, lets the coach toggle options and **create a new
option** inline within a group (`POST /api/v1/filters/options/`). Used on the
course form (`scope=course`) and on each event form (`scope=event`), writing
`filter_option_ids`.

### Block config — coach picks facets per block
Add a `filterGroups` block field (array of `FilterGroup` ids) to `courseGrid` and
`upcomingEvents`. New field-renderer control type `"filterGroups"` (with a
`filterScope: "course" | "event"` on the field schema) that fetches the coach's
groups for that scope and renders checkboxes — the coach adds facets one at a
time. Stored as block data (passes through `_clean_block` untouched).

### Public faceting
`CourseCatalogClient` and the events block client receive the selected group ids
(from block config) and the items (each carrying `filter_options`). For each
chosen group that exists among the items, render a pill facet (the group's
options as toggle pills). Filtering: **within a group, selected options OR;
across groups, AND** (standard faceted search), combined with the existing
pricing/search filters and gated by `showFilters`. No facet row renders for a
group with no matching options (graceful). Reuses B's pill styling, token-only.

## Verification

1. `pytest apps/filters apps/courses apps/live` — new + existing green:
   filter model slug/uniqueness; group/option CRUD (coach-only writes);
   course & event create/update round-trip `filter_option_ids`; calendar feed
   includes `filter_options`; adminkit M2M filter returns the right items;
   CourseCategory removal leaves no dangling refs.
2. `make makemigrations` clean (filters/courses/live); `make migrate` applies.
3. `tsc --noEmit` clean (both frontends if `frontend-main` is touched — it is
   not expected to be).
4. Live: create a Filter + Options in the admin; tag a course and an event;
   on a Courses block pick which facets to show → public catalog shows those
   facets and filters (within-group OR, across-group AND); same for an Events
   block; filter courses/events by option in the admin panel.

## Risks / notes

- **Large change set** (new app, 5 M2M, removal of CourseCategory, both
  frontends, adminkit core tweak). Sequenced as one plan with many small tasks
  and per-task commits for durable progress.
- **Adminkit M2M filter** is a shared-framework change — keep it minimal and
  backward-compatible (other admins unaffected); cover with a test.
- **Block config dynamic control** (`filterGroups`) fetches tenant data in the
  editor — mirror how other pickers fetch (`clientFetch`); degrade gracefully
  when the coach has no filters (no facet picker shown).
- Stays on local `main`; **not** pushed/deployed (origin carries the unverified
  marketplace merge — project-state memory). Run `make migrate` + `pytest` and
  verify in dev.
- The just-built CourseCategory commits remain in history; this change supersedes
  them with a forward migration (drop the model) rather than a git revert.
