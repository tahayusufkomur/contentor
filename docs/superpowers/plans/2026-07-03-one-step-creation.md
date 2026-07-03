# One-Step Creation Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Course creation (incl. thumbnail + full curriculum) becomes one atomic form submit; photo previews never render raw S3 keys; paid downloads get price + tags at creation.

**Architecture:** `POST /api/v1/courses/` gains an optional write-only nested `modules` list (module → lessons), created inside `transaction.atomic()` — same nested-create pattern bundles already use for `items`. The course create form composes curriculum in local React state and sends one payload. `PhotoPicker` gets a URL guard so non-URL `src` values render the placeholder instead of a broken `<img>`.

**Tech Stack:** Django 5.1 + DRF (function-based views, ModelSerializers), Next.js 14 App Router + Tailwind/Radix, pytest (`@pytest.mark.django_db(transaction=True)` + tenant fixtures), Playwright e2e vs the dev stack.

**Spec:** `docs/superpowers/specs/2026-07-03-one-step-creation-design.md` — read it first, especially the Design principle section.

## Global Constraints

- Pre-commit must pass with zero issues on touched files. Run `make lint` before each commit.
- Backend tests run inside the container: `docker compose exec django pytest <path> -v`. Full suite: `make test`.
- Frontend type-check: `cd frontend-customer && npx tsc --noEmit` (repo pre-commit does NOT lint frontends — run tsc yourself).
- E2e: `make e2e` needs the dev stack up (`make dev`). Do NOT paper over hydration timeouts in e2e — they surface a real dev-env bug (see comments in `e2e/specs/02-courses.spec.ts`).
- Edit flows must not change behavior: PUT `/api/v1/courses/<slug>/` rejects `modules`; per-module/per-lesson endpoints untouched.
- `order` is derived server-side from list position, 1-based. Clients never send `order` for nested create.
- The working tree is shared with other agents: before every commit, `git status -sb` and stage ONLY the files this plan touches.
- Commit messages: repo style is `type(scope): summary` (see `git log --oneline`).

## File Structure

- `backend/apps/courses/serializers.py` — add `_NestedLessonSerializer`, `_NestedModuleSerializer`; extend `CourseCreateUpdateSerializer` (nested `modules` field, `validate_modules`, atomic `create()`).
- `backend/apps/courses/tests/test_views.py` — new `TestCourseNestedCreate` class.
- `frontend-customer/src/components/admin/photo-picker.tsx` — URL guard on `displayUrl`.
- `frontend-customer/src/components/admin/course-form.tsx` — thumbnail fix; create mode gains thumbnail picker + local curriculum builder + nested payload.
- `frontend-customer/src/app/admin/downloads/page.tsx` — price + tags on the create form.
- `e2e/specs/02-courses.spec.ts` — one-step UI creation test + nested API test.
- `e2e/specs/12-downloads.spec.ts` — new: paid download with price + tag in one submit.

---

### Task 1: Backend — nested atomic course create

**Files:**
- Modify: `backend/apps/courses/serializers.py` (around line 250, `CourseCreateUpdateSerializer`)
- Test: `backend/apps/courses/tests/test_views.py` (append new class)

**Interfaces:**
- Consumes: existing `CourseCreateUpdateSerializer`, `Module`, `Lesson` models; `_course_create` view (no view change needed — it already returns `CourseDetailSerializer`, which nests `modules`).
- Produces: `POST /api/v1/courses/` accepts optional `modules: [{title: str, lessons: [{title, content_html?, is_free_preview?, video?, video_url?, duration_seconds?}]}]`. Response body (201) includes `modules[].lessons[]` with server-assigned 1-based `order`. `modules` on update (`self.instance` set) → 400.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/courses/tests/test_views.py` (conventions: tenant fixtures from conftest, `make_client` helper defined at the top of this file):

```python
# ---------------------------------------------------------------------------
# Tests: nested course create  POST /api/v1/courses/ with modules
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCourseNestedCreate:
    def test_nested_create_builds_full_curriculum(self, owner):
        """One POST creates course + modules + lessons with 1-based positional order."""
        client = make_client(owner)
        payload = {
            "title": "Nested Course",
            "pricing_type": "free",
            "modules": [
                {
                    "title": "Module A",
                    "lessons": [
                        {"title": "Lesson 1", "is_free_preview": True},
                        {"title": "Lesson 2", "content_html": "<p>hi</p>"},
                    ],
                },
                {"title": "Module B", "lessons": []},
            ],
        }
        resp = client.post("/api/v1/courses/", payload, format="json")
        assert resp.status_code == 201, resp.content
        body = resp.json()
        assert [m["title"] for m in body["modules"]] == ["Module A", "Module B"]
        assert [m["order"] for m in body["modules"]] == [1, 2]
        lessons = body["modules"][0]["lessons"]
        assert [lesson["title"] for lesson in lessons] == ["Lesson 1", "Lesson 2"]
        assert [lesson["order"] for lesson in lessons] == [1, 2]
        assert lessons[0]["is_free_preview"] is True
        course = Course.objects.get(slug=body["slug"])
        assert course.modules.count() == 2
        assert course.modules.get(order=1).lessons.count() == 2

    def test_nested_create_without_modules_unchanged(self, owner):
        """Flat create (no modules key) behaves exactly as before."""
        client = make_client(owner)
        resp = client.post(
            "/api/v1/courses/", {"title": "Flat Course", "pricing_type": "free"}, format="json"
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["modules"] == []

    def test_nested_create_empty_modules_list(self, owner):
        """Explicit empty modules list is valid and creates no modules."""
        client = make_client(owner)
        resp = client.post(
            "/api/v1/courses/",
            {"title": "Empty Modules", "pricing_type": "free", "modules": []},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert Course.objects.get(slug=resp.json()["slug"]).modules.count() == 0

    def test_invalid_lesson_rejected_and_no_course_created(self, owner):
        """A missing lesson title fails validation; no course row is written."""
        client = make_client(owner)
        payload = {
            "title": "Broken Course",
            "pricing_type": "free",
            "modules": [{"title": "M", "lessons": [{"content_html": "no title"}]}],
        }
        resp = client.post("/api/v1/courses/", payload, format="json")
        assert resp.status_code == 400, resp.content
        assert "title" in str(resp.json())
        assert not Course.objects.filter(title="Broken Course").exists()

    def test_invalid_video_rejected_and_no_course_created(self, owner):
        """A bogus video PK fails validation; no course row is written."""
        client = make_client(owner)
        payload = {
            "title": "Bad Video Course",
            "pricing_type": "free",
            "modules": [{"title": "M", "lessons": [{"title": "L", "video": 999999}]}],
        }
        resp = client.post("/api/v1/courses/", payload, format="json")
        assert resp.status_code == 400, resp.content
        assert not Course.objects.filter(title="Bad Video Course").exists()

    def test_create_is_atomic_on_midway_failure(self, owner, monkeypatch):
        """If a lesson insert blows up mid-create, course and modules roll back."""
        from django.db import IntegrityError

        from apps.courses import serializers as course_serializers

        def boom(*args, **kwargs):
            raise IntegrityError("simulated failure")

        monkeypatch.setattr(
            course_serializers.Lesson.objects, "create", boom
        )
        client = make_client(owner)
        payload = {
            "title": "Atomic Course",
            "pricing_type": "free",
            "modules": [{"title": "M", "lessons": [{"title": "L"}]}],
        }
        with pytest.raises(IntegrityError):
            client.post("/api/v1/courses/", payload, format="json")
        assert not Course.objects.filter(title="Atomic Course").exists()
        assert not Module.objects.filter(title="M").exists()

    def test_modules_rejected_on_update(self, published_course, owner):
        """PUT with modules → 400; curriculum edits use the per-item endpoints."""
        client = make_client(owner)
        resp = client.put(
            f"/api/v1/courses/{published_course.slug}/",
            {
                "title": published_course.title,
                "pricing_type": "free",
                "modules": [{"title": "Sneaky", "lessons": []}],
            },
            format="json",
        )
        assert resp.status_code == 400, resp.content
        assert not Module.objects.filter(title="Sneaky").exists()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec django pytest apps/courses/tests/test_views.py -k NestedCreate -v`
Expected: FAIL — the nested tests get 201-without-modules or field errors (`modules` is not a serializer field yet, DRF silently ignores unknown keys, so `test_nested_create_builds_full_curriculum` fails on `body["modules"] == []`); `test_modules_rejected_on_update` fails with 200.

- [ ] **Step 3: Implement the nested serializers**

In `backend/apps/courses/serializers.py`, add `from django.db import transaction` to the imports, then add ABOVE `CourseCreateUpdateSerializer`:

```python
class _NestedLessonSerializer(serializers.ModelSerializer):
    """Lesson payload inside a nested course create. Order is positional."""

    class Meta:
        model = Lesson
        fields = [
            "title",
            "video",
            "video_url",
            "duration_seconds",
            "content_html",
            "is_free_preview",
        ]


class _NestedModuleSerializer(serializers.Serializer):
    """Module payload inside a nested course create. Order is positional."""

    title = serializers.CharField(max_length=200)
    lessons = _NestedLessonSerializer(many=True, required=False)
```

Then extend `CourseCreateUpdateSerializer`:

```python
class CourseCreateUpdateSerializer(serializers.ModelSerializer):
    filter_option_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=FilterOption.objects.all(),
        source="filter_options",
        required=False,
    )
    tag_ids = tag_ids_field("course")
    modules = _NestedModuleSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Course
        fields = [
            "title",
            "description",
            "thumbnail_url",
            "thumbnail",
            "price",
            "pricing_type",
            "is_published",
            "order",
            "filter_option_ids",
            "tag_ids",
            "modules",
        ]

    def validate_modules(self, value):
        if self.instance is not None:
            raise serializers.ValidationError(
                "Curriculum can only be set at creation. Use the module/lesson endpoints to edit."
            )
        return value

    def create(self, validated_data):
        modules_data = validated_data.pop("modules", [])
        with transaction.atomic():
            course = super().create(validated_data)
            for module_index, module_data in enumerate(modules_data, start=1):
                module = Module.objects.create(
                    course=course, title=module_data["title"], order=module_index
                )
                for lesson_index, lesson_data in enumerate(
                    module_data.get("lessons", []), start=1
                ):
                    Lesson.objects.create(module=module, order=lesson_index, **lesson_data)
        return course
```

Note: `_NestedLessonSerializer(many=True)` validates each lesson dict (including the `video` FK lookup) during `is_valid()`, so bad payloads 400 before any DB write. The `transaction.atomic()` covers genuine mid-create DB failures.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec django pytest apps/courses/tests/test_views.py -v`
Expected: ALL PASS (the new class and every pre-existing test in the file).

- [ ] **Step 5: Lint and commit**

```bash
make lint   # or: pre-commit run --files backend/apps/courses/serializers.py backend/apps/courses/tests/test_views.py
git status -sb   # confirm only the two files below are staged-relevant
git add backend/apps/courses/serializers.py backend/apps/courses/tests/test_views.py
git commit -m "feat(courses): nested atomic course create with modules and lessons"
```

---

### Task 2: Frontend — thumbnail preview fix + PhotoPicker URL guard

**Files:**
- Modify: `frontend-customer/src/components/admin/photo-picker.tsx:122` (the `displayUrl` line)
- Modify: `frontend-customer/src/components/admin/course-form.tsx:257-270` (the edit-mode PhotoPicker block)

**Interfaces:**
- Consumes: `Photo` type (`photo.signed_url: string | null`, `photo.s3_key`, `photo.id`), `CourseDetail.thumbnail_signed_url?: string`.
- Produces: `PhotoPicker` renders its placeholder icon whenever `displayUrl` is not URL-shaped (raw s3 keys like `demo/photos/x.jpg` no longer become `<img src>`). `course-form` carries `photo.signed_url` into `thumbnail_signed_url` on select.

There is no frontend unit-test runner in this repo — verification is `tsc` here plus the Playwright assertions in Task 5.

- [ ] **Step 1: Add the URL guard in PhotoPicker**

In `frontend-customer/src/components/admin/photo-picker.tsx`, replace:

```typescript
  const displayUrl = previewUrl || value;
```

with:

```typescript
  // A raw s3 key (e.g. "demo/photos/x.jpg") must never become an <img src> —
  // the browser resolves it relative to the page and 404s. Only render values
  // that are absolute, root-relative, or object URLs.
  const candidateUrl = previewUrl || value;
  const displayUrl =
    candidateUrl && /^(https?:\/\/|\/|data:|blob:)/.test(candidateUrl)
      ? candidateUrl
      : null;
```

- [ ] **Step 2: Carry the signed URL through course-form's onSelect**

In `frontend-customer/src/components/admin/course-form.tsx`, in the edit-mode PhotoPicker block, replace:

```typescript
                onSelect={(photo: Photo) =>
                  setCourse({ ...course, thumbnail_url: photo.s3_key, thumbnail_id: photo.id })
                }
                onClear={() => setCourse({ ...course, thumbnail_url: "", thumbnail_id: null })}
```

with:

```typescript
                onSelect={(photo: Photo) =>
                  setCourse({
                    ...course,
                    thumbnail_url: photo.s3_key,
                    thumbnail_id: photo.id,
                    thumbnail_signed_url: photo.signed_url ?? undefined,
                  })
                }
                onClear={() =>
                  setCourse({
                    ...course,
                    thumbnail_url: "",
                    thumbnail_id: null,
                    thumbnail_signed_url: undefined,
                  })
                }
```

(Task 3 rewires this same block for create mode; the `thumbnail_signed_url` triple stays.)

- [ ] **Step 3: Type-check**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git status -sb
git add frontend-customer/src/components/admin/photo-picker.tsx frontend-customer/src/components/admin/course-form.tsx
git commit -m "fix(admin): thumbnail preview uses signed url; PhotoPicker refuses non-URL src"
```

---

### Task 3: Frontend — one-step course create form (thumbnail + local curriculum)

**Files:**
- Modify: `frontend-customer/src/components/admin/course-form.tsx`

**Interfaces:**
- Consumes: Task 1's API (`modules` in POST payload), Task 2's PhotoPicker behavior, existing `LessonCreatePanel` + `NewLessonState`, `PhotoPicker`, `FilterPicker`, `TagInput`.
- Produces: create mode renders ALL fields (title, description, thumbnail, pricing, publish, filters, tags) plus a curriculum builder over local state; one Create click POSTs the nested payload and redirects to `/admin/courses/{slug}`. Edit mode unchanged.

- [ ] **Step 1: Extend create-mode state**

In `course-form.tsx`, replace the `createForm` state and add local-curriculum state below it:

```typescript
  // Create-mode form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    pricing_type: "free" as "free" | "paid",
    price: "0.00",
    is_published: false,
    thumbnail_url: "",
    thumbnail_id: null as string | null,
    thumbnail_signed_url: null as string | null,
  })

  // Create-mode local curriculum (owned children stay local until the one
  // atomic submit — see the design principle in the 2026-07-03 spec)
  interface LocalModule {
    tempId: number
    title: string
    lessons: NewLessonState[]
  }
  const [localModules, setLocalModules] = useState<LocalModule[]>([])
```

Move the `NewLessonState` interface declaration from the bottom of the file to ABOVE the `CourseForm` component so both can use it (it is currently declared just before `LessonCreatePanel`).

- [ ] **Step 2: Add local curriculum handlers**

Add next to the existing module/lesson handlers:

```typescript
  // --- Create-mode local curriculum (no API calls until submit) ---
  function addLocalModule() {
    if (!newModuleTitle.trim()) return
    setLocalModules([
      ...localModules,
      { tempId: Date.now(), title: newModuleTitle.trim(), lessons: [] },
    ])
    setNewModuleTitle("")
  }

  function removeLocalModule(tempId: number) {
    setLocalModules(localModules.filter((m) => m.tempId !== tempId))
  }

  function addLocalLesson(tempId: number) {
    if (!newLesson.title.trim()) return
    setLocalModules(
      localModules.map((m) =>
        m.tempId === tempId ? { ...m, lessons: [...m.lessons, { ...newLesson }] } : m
      )
    )
    setAddingLessonForModule(null)
    setNewLesson({ title: "", content_html: "", is_free_preview: false, video: null, videoPreviewUrl: null })
  }

  function removeLocalLesson(tempId: number, lessonIndex: number) {
    setLocalModules(
      localModules.map((m) =>
        m.tempId === tempId
          ? { ...m, lessons: m.lessons.filter((_, i) => i !== lessonIndex) }
          : m
      )
    )
  }
```

(`addingLessonForModule: number | null` is reused — in create mode it holds a `tempId`.)

- [ ] **Step 3: Send the nested payload on create**

Replace the create branch of `handleSave` with:

```typescript
    if (isCreate) {
      setSaving(true)
      try {
        const created = await clientFetch<Course>("/api/v1/courses/", {
          method: "POST",
          body: JSON.stringify({
            title: createForm.title,
            description: createForm.description,
            pricing_type: createForm.pricing_type,
            price: createForm.price,
            is_published: createForm.is_published,
            thumbnail_url: createForm.thumbnail_url,
            thumbnail: createForm.thumbnail_id || null,
            filter_option_ids: filterOptionIds,
            tag_ids: tagIds,
            modules: localModules.map((m) => ({
              title: m.title,
              lessons: m.lessons.map((l) => ({
                title: l.title,
                content_html: l.content_html,
                is_free_preview: l.is_free_preview,
                ...(l.video ? { video: l.video } : {}),
              })),
            })),
          }),
        })
        toast.success("Course created")
        router.push(`/admin/courses/${created.slug}`)
      } catch (err) {
        console.error(err)
        toast.error("Failed to create course")
      } finally {
        setSaving(false)
      }
      return
    }
```

(On 400 the toast shows and all local state is kept — no redirect.)

- [ ] **Step 4: Show the thumbnail picker in BOTH modes**

Replace the `{!isCreate && course && (...)}` thumbnail block with an unconditional one:

```tsx
          <div className="space-y-2">
            <Label>Thumbnail</Label>
            <PhotoPicker
              value={isCreate ? createForm.thumbnail_url : (course?.thumbnail_url ?? null)}
              previewUrl={
                isCreate
                  ? createForm.thumbnail_signed_url
                  : (course?.thumbnail_signed_url || course?.thumbnail_url || null)
              }
              onSelect={(photo: Photo) => {
                if (isCreate) {
                  setCreateForm({
                    ...createForm,
                    thumbnail_url: photo.s3_key,
                    thumbnail_id: photo.id,
                    thumbnail_signed_url: photo.signed_url,
                  })
                } else if (course) {
                  setCourse({
                    ...course,
                    thumbnail_url: photo.s3_key,
                    thumbnail_id: photo.id,
                    thumbnail_signed_url: photo.signed_url ?? undefined,
                  })
                }
              }}
              onClear={() => {
                if (isCreate) {
                  setCreateForm({
                    ...createForm,
                    thumbnail_url: "",
                    thumbnail_id: null,
                    thumbnail_signed_url: null,
                  })
                } else if (course) {
                  setCourse({
                    ...course,
                    thumbnail_url: "",
                    thumbnail_id: null,
                    thumbnail_signed_url: undefined,
                  })
                }
              }}
              label="Choose thumbnail"
            />
          </div>
```

- [ ] **Step 5: Move the submit button and add the create-mode curriculum builder**

In the settings Card, wrap the existing submit button so it renders in EDIT mode only:

```tsx
          {!isCreate && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
```

Then, after the settings Card's closing `</Card>` and BEFORE the existing `{!isCreate && course && (...)}` curriculum block, add the create-mode builder + final submit:

```tsx
      {/* ───── Curriculum (create mode: composed locally, submitted with the course) ───── */}
      {isCreate && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Curriculum</CardTitle>
              <CardDescription>
                Add modules and lessons now — everything is created together in one step.
              </CardDescription>
            </CardHeader>
          </Card>

          {localModules.map((mod, moduleIndex) => (
            <Card key={mod.tempId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Module {moduleIndex + 1}: {mod.title}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeLocalModule(mod.tempId)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {mod.lessons.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Video</TableHead>
                        <TableHead>Preview</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mod.lessons.map((lesson, lessonIndex) => (
                        <TableRow key={lessonIndex}>
                          <TableCell className="font-medium">{lesson.title}</TableCell>
                          <TableCell>
                            <Badge variant={lesson.video ? "success" : "secondary"}>
                              {lesson.video ? "Selected" : "No video"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {lesson.is_free_preview && <Badge variant="outline">Free</Badge>}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeLocalLesson(mod.tempId, lessonIndex)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {addingLessonForModule === mod.tempId ? (
                  <LessonCreatePanel
                    newLesson={newLesson}
                    setNewLesson={setNewLesson}
                    onSave={() => addLocalLesson(mod.tempId)}
                    onCancel={() => {
                      setAddingLessonForModule(null)
                      setNewLesson({
                        title: "",
                        content_html: "",
                        is_free_preview: false,
                        video: null,
                        videoPreviewUrl: null,
                      })
                    }}
                    saving={false}
                  />
                ) : (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setAddingLessonForModule(mod.tempId)}
                  >
                    <Plus className="h-4 w-4" /> Add Lesson
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="New module title"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addLocalModule()
                  }}
                />
                <Button className="gap-2 shrink-0" onClick={addLocalModule}>
                  <Plus className="h-4 w-4" /> Add Module
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving || !createForm.title.trim()}>
            {saving ? "Creating..." : "Create Course"}
          </Button>
        </>
      )}
```

- [ ] **Step 6: Type-check and verify in the running app**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

With `make dev` up, open `http://demo-yoga.localhost/admin/courses/new` as a coach and confirm: thumbnail picker present, module + lesson composable, one Create click lands on `/admin/courses/<slug>` showing the curriculum. (Login: `make shell` → or reuse the e2e `issue_login_token` management command as in `e2e/helpers/auth.ts`.)

- [ ] **Step 7: Commit**

```bash
git status -sb
git add frontend-customer/src/components/admin/course-form.tsx
git commit -m "feat(admin): one-step course creation with thumbnail and local curriculum builder"
```

---

### Task 4: Frontend — downloads create form gains price + tags

**Files:**
- Modify: `frontend-customer/src/app/admin/downloads/page.tsx`

**Interfaces:**
- Consumes: `DownloadFileCreateSerializer` already accepts `price` and `tag_ids` on POST (`backend/apps/downloads/serializers.py:58`) — no backend change. `TagInput` (`@/components/admin/tag-input`, props `value: number[]`, `onChange`, `scope: "download"`).
- Produces: creating a paid download sends `price`; tags are attachable at creation.

- [ ] **Step 1: Extend the create form state and payload**

In `frontend-customer/src/app/admin/downloads/page.tsx`, extend the form state:

```typescript
  const [form, setForm] = useState({
    title: "",
    pricing_type: "free" as "free" | "paid",
    price: "",
  })
  const [createTagIds, setCreateTagIds] = useState<number[]>([])
```

In `handleFileUpload`, replace the create POST body:

```typescript
      const created = await clientFetch<DownloadFile>("/api/v1/downloads/", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          pricing_type: form.pricing_type,
          ...(form.pricing_type === "paid" && form.price
            ? { price: parseFloat(form.price) }
            : {}),
          tag_ids: createTagIds,
        }),
      })
```

And update the two reset sites (success path in `handleFileUpload`, and keep the Cancel toggle working):

```typescript
      setForm({ title: "", pricing_type: "free", price: "" })
      setCreateTagIds([])
```

Add the import: `import { TagInput } from "@/components/admin/tag-input"`.

- [ ] **Step 2: Add the price and tags fields to the create card**

After the Title/Access grid `</div>` (the one closing the `sm:grid-cols-2` grid) and before the File block, add:

```tsx
            {form.pricing_type === "paid" && (
              <div className="space-y-2">
                <Label htmlFor="dl_price">Price</Label>
                <Input
                  id="dl_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput value={createTagIds} onChange={setCreateTagIds} scope="download" />
            </div>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git status -sb
git add frontend-customer/src/app/admin/downloads/page.tsx
git commit -m "feat(admin): price and tags on the download create form"
```

---

### Task 5: E2e — one-step course creation + downloads creation specs

**Files:**
- Modify: `e2e/specs/02-courses.spec.ts` (append two tests)
- Create: `e2e/specs/12-downloads.spec.ts`

**Interfaces:**
- Consumes: `coachContext(browser)`, `TENANT` from `../helpers/auth`; fixture `e2e/fixtures/pixel.png`; the UI built in Tasks 3-4; the API from Task 1.
- Produces: regression coverage for the one-step flows and the thumbnail preview URL.

Read the header comments of `e2e/specs/02-courses.spec.ts` first: the Radix "Publish immediately" switch is NOT clickable in headless mode — these tests deliberately leave the course unpublished, which is fine for admin-side assertions.

- [ ] **Step 1: Append the API-level nested create test to `02-courses.spec.ts`**

```typescript
test("nested course create API builds the full curriculum in one atomic POST", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const title = `E2E Nested ${Date.now()}`;

  const res = await coach.request.post(`${TENANT}/api/v1/courses/`, {
    data: {
      title,
      pricing_type: "free",
      price: 0,
      modules: [
        {
          title: "Module A",
          lessons: [{ title: "Lesson 1", is_free_preview: true }, { title: "Lesson 2" }],
        },
        { title: "Module B", lessons: [] },
      ],
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status(), `Nested create failed: ${await res.text()}`).toBe(201);
  const body = await res.json();
  expect(body.modules.map((m: { title: string }) => m.title)).toEqual(["Module A", "Module B"]);
  expect(body.modules[0].lessons.map((l: { order: number }) => l.order)).toEqual([1, 2]);

  await coach.close();
});
```

- [ ] **Step 2: Append the one-step UI creation test to `02-courses.spec.ts`**

```typescript
test("coach composes thumbnail + module + lesson and creates the course in ONE submit", async ({
  browser,
}) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/courses/new`);

  const title = `E2E OneStep ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Created in a single step");

  // ── Thumbnail: upload in-place through the PhotoPicker modal ─────────────
  await page.getByRole("button", { name: "Choose thumbnail" }).click();
  await page.locator('input[type="file"]').setInputFiles("fixtures/pixel.png");
  // The preview must be a real URL (signed), never a raw s3 key resolved
  // relative to the page (the old 404 bug).
  const preview = page.locator('img[alt="Selected"]');
  await expect(preview).toBeVisible({ timeout: 20_000 });
  expect(await preview.getAttribute("src")).toMatch(/^https?:\/\//);

  // ── Curriculum: one module, one lesson, all local until submit ───────────
  await page.getByPlaceholder("New module title").fill("Getting Started");
  await page.getByRole("button", { name: "Add Module" }).click();
  await expect(page.getByText("Module 1: Getting Started")).toBeVisible();

  await page.getByRole("button", { name: "Add Lesson" }).click();
  await page.getByPlaceholder("Lesson title").fill("Welcome");
  // The open panel's save button is also named "Add Lesson"; the trigger
  // button was replaced by the panel, so the last match is the panel's.
  await page.getByRole("button", { name: "Add Lesson", exact: true }).last().click();
  await expect(page.getByRole("cell", { name: "Welcome" })).toBeVisible();

  // ── ONE submit creates everything atomically ─────────────────────────────
  await page.getByRole("button", { name: "Create Course" }).click();
  await page.waitForURL(/\/admin\/courses\/(?!new$)[^/]+$/, { timeout: 20_000 });

  // The edit page proves the curriculum landed with the course.
  await expect(page.getByText("Module 1: Getting Started")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("cell", { name: "Welcome" })).toBeVisible();

  await coach.close();
});
```

- [ ] **Step 3: Create `e2e/specs/12-downloads.spec.ts`**

```typescript
// e2e/specs/12-downloads.spec.ts
//
// One-step download creation: a PAID download gets its price and a tag at
// creation time (no follow-up edit). UI drives the form; the API confirms
// the persisted values because the list row's price rendering is not a
// stable contract.

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a paid download with price and tag in one submit", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/downloads`);

  const title = `E2E Paid DL ${Date.now()}`;
  const tagName = `e2e-dl-${Date.now()}`;

  await page.getByRole("button", { name: "Upload File" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Access Type").selectOption("paid");
  await page.getByLabel("Price").fill("9.99");

  // Tag created in-place via the TagInput "Create …" row
  await page.getByPlaceholder("Add a tag…").fill(tagName);
  await page.getByRole("button", { name: /Create/ }).click();

  await page.locator('input[type="file"]').setInputFiles("fixtures/pixel.png");
  await expect(page.getByText("File uploaded")).toBeVisible({ timeout: 20_000 });

  // Confirm persisted values via the API (single-submit, no edit happened)
  const res = await coach.request.get(
    `${TENANT}/api/v1/downloads/?search=${encodeURIComponent(title)}&limit=5&offset=0&ordering=-created_at`
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  const created = body.results.find((d: { title: string }) => d.title === title);
  expect(created, `created download not in list: ${JSON.stringify(body)}`).toBeTruthy();
  expect(created.pricing_type).toBe("paid");
  expect(parseFloat(created.price)).toBeCloseTo(9.99);
  expect(created.tags.map((t: { name: string }) => t.name)).toContain(tagName);

  await coach.close();
});
```

- [ ] **Step 4: Run the new specs against the dev stack**

Ensure the stack is up (`make dev`, seeded). Then:

Run: `cd e2e && npx playwright test specs/02-courses.spec.ts specs/12-downloads.spec.ts`
Expected: all tests pass. If a hydration timeout appears (title never visible on an admin page), that is the known dev-env bundle bug — surface it, do NOT retry-loop it away.

- [ ] **Step 5: Run the full e2e suite**

Run: `make e2e`
Expected: previous baseline (18 passed + 3 skipped as of 2026-07-03) plus the 3 new tests → 21 passed + 3 skipped (Stripe specs skip without `make stripe-listen`).

- [ ] **Step 6: Commit**

```bash
git status -sb
git add e2e/specs/02-courses.spec.ts e2e/specs/12-downloads.spec.ts
git commit -m "test(e2e): one-step course + paid download creation specs"
```

---

### Task 6: Final verification

**Files:** none new — verification only.

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: zero failures — the full pre-existing suite plus the 7 new `TestCourseNestedCreate` tests.

- [ ] **Step 2: Frontend type-check**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint gate**

Run: `make lint`
Expected: zero errors/warnings on the files this plan touched (pre-existing issues elsewhere are out of scope — do not fix unrelated files).

- [ ] **Step 4: Full e2e**

Run: `make e2e`
Expected: 21 passed + 3 skipped.

- [ ] **Step 5: Confirm the tree is clean and every commit is scoped**

```bash
git status -sb
git log --oneline -6
```

Expected: 5 commits from Tasks 1-5 (backend nested create, thumbnail fix, course form, downloads form, e2e specs), no unstaged leftovers from THIS plan (other agents' files may be dirty — leave them alone).
