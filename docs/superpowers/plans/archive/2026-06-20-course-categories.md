# Course Category Taxonomy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (chosen: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A coach-managed, multi-category (tag) taxonomy for courses: a `CourseCategory` model + `Course.categories` M2M, CRUD API, adminkit panel, course-form create-on-the-fly picker, and a public catalog category pill row.

**Architecture:** Per-tenant `CourseCategory` model; M2M to `Course`. Category CRUD endpoints under `/api/v1/courses/categories/` (registered before the `<slug>` route). Course serializers read `categories` and write `category_ids`. Public catalog reuses the existing `/api/v1/courses/` fetch (categories embedded) and filters client-side.

**Tech Stack:** Django 5.1 + DRF + django-tenants (TENANT_APPS migration), adminkit, Next.js 14 + TS.

## Global Constraints

- Tenant migration (apps.courses is a TENANT_APP): `make makemigrations` then
  `make migrate`. No data backfill.
- Category endpoints: `@permission_classes([IsCoachOrOwner])`, mirroring
  `video_list_create`/`video_detail`.
- **URL ordering:** `categories/` + `categories/<int:pk>/` MUST precede
  `<slug:slug>/` in `apps/courses/urls.py`.
- Token-only frontend (house design system); chips = `Badge`.
- Stays on local `main`; do not push/deploy (origin carries the unverified
  marketplace merge — project-state memory).
- Commit per task. Work dir: `~/ws/projects-in-progress/contentor`.

---

### Task 1: `CourseCategory` model + `Course.categories` M2M + migration

**Files:** `backend/apps/courses/models.py`; new migration.

- [ ] **Step 1:** Add `CourseCategory` (above `Course`) with `name`, unique
  `slug`, `order`, `created_at`; `Meta(app_label="courses", ordering=["order",
  "name"], verbose_name_plural="Course categories")`; a `save()` that slugifies
  `name` with uniqueness (mirror `Course.save`); and a
  `@property course_count` → `self.courses.count()`.
- [ ] **Step 2:** Add to `Course`:
  `categories = models.ManyToManyField("CourseCategory", blank=True, related_name="courses")`.
- [ ] **Step 3:** `docker compose exec -T django python manage.py makemigrations courses`
  → review: one `CreateModel CourseCategory` + one `AddField Course.categories`.
- [ ] **Step 4:** `docker compose exec -T django python manage.py migrate_schemas`
  (or `make migrate`) — applies across tenants.
- [ ] **Step 5:** Commit (model + migration):
  `feat(courses): add CourseCategory model + Course.categories M2M`.

---

### Task 2: Serializers (category + course read/write)

**Files:** `backend/apps/courses/serializers.py`.

- [ ] **Step 1:** Add `CourseCategorySerializer` — fields `id, name, slug, order,
  course_count`; `course_count = serializers.IntegerField(source="course_count",
  read_only=True)` (resolves the model property) or a `SerializerMethodField`;
  read-only `id, slug, course_count`.
- [ ] **Step 2:** In `CourseListSerializer` and `CourseDetailSerializer`: add
  `categories = CourseCategorySerializer(many=True, read_only=True)` and add
  `"categories"` to `fields`.
- [ ] **Step 3:** In `CourseCreateUpdateSerializer`: add
  `category_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=CourseCategory.objects.all(), source="categories", required=False)`
  and add `"category_ids"` to `fields`.
- [ ] **Step 4:** Commit: `feat(courses): expose categories (read) + category_ids (write) on course serializers`.

---

### Task 3: Category CRUD views + URLs

**Files:** `backend/apps/courses/views.py`, `backend/apps/courses/urls.py`.

- [ ] **Step 1:** Add `category_list_create` (`@api_view(["GET","POST"])`,
  `@permission_classes([IsCoachOrOwner])`): GET → `CourseCategory.objects.all()`
  (model ordering) serialized; POST → create from `{name, order?}`.
- [ ] **Step 2:** Add `category_detail` (`@api_view(["GET","PUT","DELETE"])`,
  `@permission_classes([IsCoachOrOwner])`) by pk.
- [ ] **Step 3:** In `urls.py`, add **before** the `<slug:slug>/` route:
  ```python
  path("categories/", views.category_list_create, name="category-list-create"),
  path("categories/<int:pk>/", views.category_detail, name="category-detail"),
  ```
- [ ] **Step 4:** Commit: `feat(courses): add course category CRUD endpoints`.

---

### Task 4: Adminkit registration

**Files:** `backend/apps/courses/admin_panels.py`.

- [ ] **Step 1:** `from .models import Course, CourseCategory`; register
  `CourseCategoryAdmin(ModelAdmin)` — `icon="tag"`, `description`, `list_display=
  ("name","order","course_count","created_at")`, `search_fields=("name",)`,
  `ordering=("order","name")`, `fields=("name","order")`,
  `readonly_fields=("slug",)`. (`course_count` resolves via the model property;
  if adminkit can't render it, drop it from `list_display`.)
- [ ] **Step 2:** Commit: `feat(courses): register CourseCategory in studio adminkit`.

---

### Task 5: Backend tests

**Files:** `backend/apps/courses/tests/` (new test module).

- [ ] **Step 1:** Tests: (a) `CourseCategory.save` slugifies + uniqueness;
  (b) `GET categories/` lists in `order,name`; (c) `POST categories/` as
  coach 201, as student 403; (d) course create+update with `category_ids`
  round-trips (course.categories set); (e) `CourseListSerializer` output includes
  `categories`; (f) `GET /api/v1/courses/categories/` resolves to the category
  view (not the `<slug>` course route).
- [ ] **Step 2:** `docker compose exec -T django pytest apps/courses -q` → green.
- [ ] **Step 3:** Commit: `test(courses): cover category model, endpoints, and course round-trip`.

---

### Task 6: Frontend types

**Files:** `frontend-customer/src/types/course.ts`.

- [ ] **Step 1:** Add `export interface CourseCategory { id: number; name: string;
  slug: string; order?: number; course_count?: number }`.
- [ ] **Step 2:** Add `categories?: { id: number; name: string; slug: string }[]`
  to `Course`.
- [ ] **Step 3:** Commit with Task 7 (type-only).

---

### Task 7: Course-form category combobox (create-on-the-fly)

**Files:** `frontend-customer/src/components/admin/course-form.tsx` (+ a small
`category-picker` helper if it keeps the form readable).

- [ ] **Step 1:** Load categories (`GET /api/v1/courses/categories/`) into state on
  mount; track selected `category_ids` (seeded from `course.categories` when
  editing).
- [ ] **Step 2:** Render selected categories as removable `Badge` chips + an
  "add" control: a menu/list of existing categories to toggle, and a text input
  to create a new one (`POST /api/v1/courses/categories/ {name}` → append +
  select). Token-only, house styling.
- [ ] **Step 3:** Include `category_ids` in the course create and update request
  bodies.
- [ ] **Step 4:** `tsc --noEmit` clean. Commit:
  `feat(course-form): assign + create categories on a course`.

---

### Task 8: Public catalog category pill row

**Files:** `frontend-customer/src/components/public/course-catalog-client.tsx`.

- [ ] **Step 1:** Compute the distinct category list from `courses` (union of
  `course.categories`, dedup by id, sort by name) via `useMemo`.
- [ ] **Step 2:** Add `categoryId: number | null` state. When `showFilters` and
  `categories.length > 0`, render a pill row (`All` + one pill per category),
  single-select, styled like the existing pricing pills.
- [ ] **Step 3:** In the `filtered` memo, AND a category predicate: when
  `categoryId != null`, keep courses whose `categories` include it.
- [ ] **Step 4:** `tsc --noEmit` clean. Commit:
  `feat(site-builder): category filter pills on the public course catalog`.

---

### Task 9: Verification

- [ ] `docker compose exec -T django pytest apps/courses -q` green; migration
  applied (`make migrate`).
- [ ] `tsc --noEmit` clean for `frontend-customer`.
- [ ] Live: course form — create a category inline, assign 2 to a course, save,
  reload → persists. Studio adminkit — CourseCategory panel CRUD. Public catalog
  — pill row appears, filters, AND-combines with Free/Paid + search, hidden by
  `showFilters` and when no categories exist.
- [ ] `docker compose down` is NOT needed (leave dev stack up for the user).

## Self-Review

- Spec coverage: model+M2M (T1), serializers (T2), CRUD+URL-order (T3), adminkit
  (T4), tests (T5), types (T6), form combobox (T7), pill filter (T8), verify (T9). ✓
- URL-capture guard tested (T5f) + routes ordered before slug (T3). ✓
- M2M write via `category_ids`/`source="categories"` round-trip tested (T5d). ✓
- Frontend AND-combines with B's existing pricing filter + `showFilters` gate. ✓
