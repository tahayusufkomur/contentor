# Course Form Consolidation & Inline Lesson Editing — Design Spec

## Summary

Consolidate the separate course create and edit pages into a single unified 3-tab form. Replace the separate lesson edit page with inline editing in the curriculum tab. Add a VideoPicker component that combines library browsing with direct upload.

## Goals

- Same 3-tab form for create and edit (Details, Curriculum, Settings)
- Inline lesson editing and creation in the curriculum tab
- VideoPicker: choose from existing video library or upload new

## 1. Unified Course Form Component

### Location: `src/components/admin/course-form.tsx`

A shared component used by both `/admin/courses/new` and `/admin/courses/[slug]`.

**Props:**
```typescript
interface CourseFormProps {
  course?: CourseDetail | null  // null = create mode
}
```

**Behavior:**
- **Create mode** (`course` is null): all 3 tabs visible. Curriculum tab shows "Save the course first to add modules and lessons" message until the course is created. Submitting Details tab does `POST /api/v1/courses/` then redirects to `/admin/courses/{slug}` (edit mode).
- **Edit mode** (`course` provided): all 3 tabs fully functional. Each tab saves independently via `PUT /api/v1/courses/{slug}/`.

### Tab 1: Details
- `title` (text, required)
- `description` (textarea)
- `thumbnail` (PhotoPicker — existing component)

### Tab 2: Curriculum
- List of modules, each containing a lessons table
- Each lesson row has: title, duration, video badge, edit (pencil) icon
- Clicking edit expands `InlineEditPanel` below the lesson row (reuses existing component)
- "Add Lesson" button at bottom of each module expands an inline create panel with same fields
- "Add Module" input + button at bottom

### Tab 3: Settings
- `pricing_type` (select: free/paid)
- `price` (number, conditional on paid)
- `is_published` (toggle)

## 2. Inline Lesson Editing

Lessons are edited inline within the curriculum tab — no separate page.

### Lesson inline edit fields (via InlineEditPanel)
- `title` (text, required)
- `content_html` (textarea)
- `is_free_preview` (toggle)
- `video` (image-like field → uses new VideoPicker component)

### Lesson inline create
Same fields as edit. Clicking "Add Lesson" expands a panel below the lessons table for the module. Submit does `POST /api/v1/courses/{slug}/modules/{moduleId}/lessons/`.

### API calls
- Edit: `PUT /api/v1/courses/{slug}/lessons/{lessonId}/`
- Create: `POST /api/v1/courses/{slug}/modules/{moduleId}/lessons/`
- Delete: `DELETE /api/v1/courses/{slug}/lessons/{lessonId}/`

## 3. VideoPicker Component

### Location: `src/components/admin/video-picker.tsx`

Shows current video preview (if any) and provides two ways to set a video:

**A) Choose from library** — expandable panel (like PhotoPicker) that:
- Fetches `GET /api/v1/courses/videos/?search=...&limit=20`
- Shows list/grid of existing videos with title + duration
- Selecting a video sets the `video` FK on the lesson

**B) Upload new** — file input for MP4/MOV/WebM that:
- Creates a video record via `POST /api/v1/courses/videos/`
- Uploads via presigned URL (`POST /api/v1/upload/presign/` → PUT to S3 → `POST /api/v1/upload/complete/`)
- Extracts duration client-side from video metadata
- Shows upload progress
- On complete, sets the `video` FK

**Props:**
```typescript
interface VideoPickerProps {
  value: number | null              // current video ID
  previewUrl: string | null         // current video signed URL
  onChange: (videoId: number | null, signedUrl: string | null) => void
}
```

**Behavior:**
- Clear button to remove video
- Only one panel open at a time (library or upload)
- After upload completes, auto-selects the new video

## 4. Page Changes

### `/admin/courses/new/page.tsx`
- Simplified to: render `<CourseForm />` with no course prop
- Keeps back button and header

### `/admin/courses/[slug]/page.tsx`
- Simplified to: fetch course data, render `<CourseForm course={course} />`
- Keeps back button and header with course title

### `/admin/courses/[slug]/lessons/[lessonId]/page.tsx`
- **Removed.** Lesson editing is now inline in the curriculum tab.

### `video-uploader.tsx`
- **Removed.** Functionality absorbed into VideoPicker.

## 5. InlineEditPanel Enhancement

The existing `InlineEditPanel` needs a new field type: `video` — renders the VideoPicker component. This follows the same pattern as the existing `image` field type with PhotoPicker.

Add to FieldConfig type options: `"video"`

The component needs a `videoPreviewUrlKey` (similar to `previewUrlKey` for images) to show the current video preview.

## Not In Scope

- Module reordering / lesson reordering (drag-and-drop)
- Rich text editor for content_html (stays as textarea)
- Module inline editing (stays as-is with title input)
