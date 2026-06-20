# Course category taxonomy — design

**Date:** 2026-06-20
**Status:** Approved, pending implementation plan
**Context:** The full-stack follow-up the user greenlit during site-builder
sub-project B (Courses display options). B added a frontend `showFilters` toggle
over the existing **pricing** filter bar; this adds a real, coach-managed
**category** taxonomy and a category filter. Independent of A–D.

## Decisions (from brainstorming)

1. **Multiple categories per course (tags)** — `Course.categories` M2M.
2. **Managed in the adminkit studio panel _plus_ create-on-the-fly** in the
   course form (a multi-select combobox: pick existing categories or type a new
   name to create it inline).
3. **Public filter:** a category **pill row** alongside B's pricing pills
   (Free/Paid/My Courses) + search, AND-combined, gated by the existing
   `showFilters` toggle.

## Model

New per-tenant model in `apps/courses/models.py`:

```python
class CourseCategory(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "courses"
        ordering = ["order", "name"]
        verbose_name_plural = "Course categories"

    def save(self, *args, **kwargs):  # slugify name; ensure uniqueness (like Course)
        ...
```

`Course` gains:

```python
categories = models.ManyToManyField(
    CourseCategory, blank=True, related_name="courses"
)
```

A tenant migration (`makemigrations courses` → new model + M2M through table;
`make migrate`). No data backfill — existing courses simply have no categories.

## API

All under the existing `/api/v1/courses/` include.

- **`CourseCategorySerializer`** — `id, name, slug, order, course_count`
  (`course_count` = `SerializerMethodField` → `obj.courses.count()`; read-only
  `id, slug, course_count`).
- **Category endpoints** (new views, `@permission_classes([IsCoachOrOwner])`,
  mirroring `video_list_create`/`video_detail`):
  - `categories/` → `category_list_create` (GET list ordered by `order, name`;
    POST create).
  - `categories/<int:pk>/` → `category_detail` (GET / PUT / DELETE).
  - **URL ordering is critical:** register both **before** the
    `<slug:slug>/` route in `urls.py` (else "categories" is captured as a course
    slug). Place them next to the `videos/` routes.
- **Course serializers:**
  - `CourseListSerializer` + `CourseDetailSerializer`: add
    `categories = CourseCategorySerializer(many=True, read_only=True)`.
  - `CourseCreateUpdateSerializer`: add
    `category_ids = serializers.PrimaryKeyRelatedField(many=True,
    queryset=CourseCategory.objects.all(), source="categories",
    required=False)` (write side sets the M2M; DRF handles M2M assignment on
    create/update for a `ModelSerializer`).

The public catalog already fetches `/api/v1/courses/` (→ `CourseListSerializer`),
so categories ride along per course — **no separate public endpoint**.

## Adminkit

Register `CourseCategory` in `apps/courses/admin_panels.py`:

```python
@studio_site.register(CourseCategory)
class CourseCategoryAdmin(ModelAdmin):
    icon = "tag"
    description = "Group your courses. Assign categories to courses in the course builder."
    list_display = ("name", "order", "course_count", "created_at")
    search_fields = ("name",)
    ordering = ("order", "name")
    fields = ("name", "order")
    readonly_fields = ("slug",)
```

(`course_count` resolves via the model/serializer; if adminkit list_display needs
a model attr, add a `course_count` property on the model. Confirm against the
adminkit `list_display` resolution at implementation time.)

## Frontend

### Types (`types/course.ts`)

```ts
export interface CourseCategory { id: number; name: string; slug: string; order?: number; course_count?: number }
// Course gains:
categories?: { id: number; name: string; slug: string }[]
```

### Course form (`components/admin/course-form.tsx`)

A **category multi-select combobox** in the course settings area:
- On mount (and after create), `GET /api/v1/courses/categories/` for the list.
- Render selected categories as removable chips + a control to add: pick an
  existing one, or type a new name and create it
  (`POST /api/v1/courses/categories/ { name }` → append to the list and select).
- Course save includes `category_ids: number[]` in the
  `CourseCreateUpdateSerializer` payload (both create and update paths).
- Token-only styling, house design-system (chips = `Badge`; combobox uses the
  existing input/menu primitives).

### Public catalog filter (`components/public/course-catalog-client.tsx`)

- Derive the distinct category list from the loaded `courses` (union of each
  course's `categories`), sorted by name.
- When `showFilters` is on **and** at least one category exists, render a
  **category pill row** (`All` + one pill per category), single-select, styled
  like the existing pricing pills.
- Filtering AND-combines with the existing pricing filter + search: a course
  matches the selected category if its `categories` include it; `All` clears the
  category filter.
- No category row when there are no categories (graceful for tenants that don't
  use them) — preserves today's look.

## Verification

1. `pytest apps/courses` (new tests + existing green): category model/slug
   uniqueness; `category_list_create`/`detail` (list ordering, create, coach-only
   write 403 for students); course create+update round-trips `category_ids`;
   `CourseListSerializer` includes `categories`.
2. `make makemigrations` produces exactly the intended migration;
   `make migrate` applies cleanly across tenants.
3. `tsc --noEmit` clean for `frontend-customer`.
4. Live: in the course form, create a category inline, assign 2 categories to a
   course, save, reload → persists. In the studio adminkit, the CourseCategory
   panel lists/edits/reorders/deletes. On the public catalog, the category pill
   row appears, filters correctly, AND-combines with Free/Paid + search, and is
   hidden by the `showFilters` toggle / when no categories exist.

## Risks

- **URL capture** (`categories/` vs `<slug:slug>/`) — mitigated by ordering the
  routes before the slug route; covered by a test hitting `categories/`.
- M2M write via `source="categories"` + `PrimaryKeyRelatedField(many=True)` is
  standard DRF; a test asserts the round-trip.
- Migration touches a tenant model — run `make migrate` and verify; no backfill
  needed. Stays on local `main`; **not** pushed/deployed (origin carries the
  unverified marketplace merge — see project-state memory).
- Adminkit `list_display` with a computed `course_count` — verify how adminkit
  resolves non-field columns; fall back to a model property if needed.
