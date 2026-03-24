# Course Form Consolidation & Inline Lesson Editing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify course create/edit into one 3-tab form, replace separate lesson edit page with inline editing, and add a VideoPicker component.

**Architecture:** A shared `CourseForm` component powers both `/admin/courses/new` and `/admin/courses/[slug]`. The curriculum tab uses `InlineEditPanel` for lesson editing and a new inline create form. A `VideoPicker` component combines library browsing with direct upload, used as a new field type in `InlineEditPanel`.

**Tech Stack:** React 19, TypeScript, shadcn/ui, Next.js App Router, clientFetch

**Spec:** `docs/superpowers/specs/2026-03-22-course-form-consolidation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/admin/video-picker.tsx` | Create | Video library picker + upload (replaces video-uploader.tsx) |
| `src/components/admin/inline-edit-panel.tsx` | Modify | Add `video` field type |
| `src/components/admin/course-form.tsx` | Create | Unified 3-tab course form (Details, Curriculum, Settings) |
| `src/app/admin/courses/new/page.tsx` | Modify | Simplify to render CourseForm in create mode |
| `src/app/admin/courses/[slug]/page.tsx` | Modify | Simplify to fetch course + render CourseForm in edit mode |
| `src/app/admin/courses/[slug]/lessons/[lessonId]/page.tsx` | Delete | Replaced by inline editing |
| `src/components/admin/video-uploader.tsx` | Delete | Replaced by VideoPicker |

All paths relative to `frontend-customer/`.

---

## Chunk 1: VideoPicker + InlineEditPanel Enhancement

### Task 1: Create VideoPicker component

**Files:**
- Create: `src/components/admin/video-picker.tsx`

The VideoPicker is modeled after the existing PhotoPicker. It shows a preview of the current video, a "Choose" button to browse the video library, and an "Upload" button to upload a new video file.

- [ ] **Step 1: Create the VideoPicker component**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { Search, Upload, Video, X } from "lucide-react"
import { formatDuration } from "@/lib/format"

interface VideoItem {
  id: number
  title: string
  duration_seconds: number
  video_signed_url: string | null
}

interface PresignResponse {
  upload_url: string
  s3_key: string
}

interface VideoPickerProps {
  value: number | null
  previewUrl: string | null
  onChange: (videoId: number | null, signedUrl: string | null) => void
}

function extractDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(Math.round(video.duration))
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(0)
    }
    video.src = URL.createObjectURL(file)
  })
}

export function VideoPicker({ value, previewUrl, onChange }: VideoPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "20", offset: "0" })
      if (search) params.set("search", search)
      const res = await clientFetch<{ results: VideoItem[]; next: string | null }>(
        `/api/v1/courses/videos/?${params}`
      )
      setVideos(res.results)
    } catch {
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(fetchVideos, 300)
    return () => clearTimeout(timer)
  }, [open, fetchVideos])

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      const duration_seconds = await extractDuration(file)
      const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")

      // Create video record
      const videoData = await clientFetch<VideoItem>("/api/v1/courses/videos/", {
        method: "POST",
        body: JSON.stringify({ title, description: "" }),
      })

      // Get presigned URL
      const { upload_url, s3_key } = await clientFetch<PresignResponse>(
        "/api/v1/upload/presign/",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category: "video",
          }),
        }
      )

      // Upload to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", upload_url)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(file)
      })

      // Complete upload
      await clientFetch("/api/v1/upload/complete/", {
        method: "POST",
        body: JSON.stringify({
          s3_key,
          category: "video",
          video_id: videoData.id,
          duration_seconds,
        }),
      })

      // Fetch updated video to get signed URL
      const updated = await clientFetch<VideoItem>(
        `/api/v1/courses/videos/${videoData.id}/`
      )
      onChange(updated.id, updated.video_signed_url)
      setOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <video
            src={previewUrl}
            className="h-16 w-24 rounded-md border object-cover"
            preload="metadata"
          />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-md border bg-muted">
            <Video className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            Choose video
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null, null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : videos.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {search ? "No videos match your search." : "No videos yet."}
            </p>
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => {
                    onChange(video.id, video.video_signed_url)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{video.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(video.duration_seconds)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend-customer && npx next build`

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/video-picker.tsx
git commit -m "feat: add VideoPicker component (library browse + upload)"
```

---

### Task 2: Add `video` field type to InlineEditPanel

**Files:**
- Modify: `src/components/admin/inline-edit-panel.tsx`

- [ ] **Step 1: Add `video` to the FieldConfig type union**

In the `type` field of `FieldConfig`, add `"video"` to the union:

```typescript
type: "text" | "number" | "select" | "toggle" | "datetime" | "textarea" | "image" | "video"
```

- [ ] **Step 2: Import VideoPicker**

```typescript
import { VideoPicker } from "@/components/admin/video-picker"
```

- [ ] **Step 3: Add video field rendering in the component body**

After the `{field.type === "image" && (...)}` block, add:

```tsx
{field.type === "video" && (
  <VideoPicker
    value={(values[field.key] as number) ?? null}
    previewUrl={imagePreviewUrls[field.key] ?? null}
    onChange={(videoId, signedUrl) => {
      setValue(field.key, videoId)
      setImagePreviewUrls((prev) => ({
        ...prev,
        [field.key]: signedUrl,
      }))
    }}
  />
)}
```

- [ ] **Step 4: Make video fields full-width like textarea/image**

Update the `className` conditional to include video:

```tsx
className={
  field.type === "textarea" || field.type === "image" || field.type === "video"
    ? "sm:col-span-2 lg:col-span-3"
    : ""
}
```

- [ ] **Step 5: Verify build**

Run: `cd frontend-customer && npx next build`

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/admin/inline-edit-panel.tsx
git commit -m "feat: add video field type to InlineEditPanel"
```

---

## Chunk 2: CourseForm Component

### Task 3: Create the unified CourseForm component

**Files:**
- Create: `src/components/admin/course-form.tsx`

This is the largest piece. It contains the 3-tab form used by both create and edit pages. The curriculum tab includes inline lesson editing and creation.

- [ ] **Step 1: Create the CourseForm component**

The component receives an optional `course` prop. When null → create mode. When provided → edit mode.

Key behaviors:
- **Details tab**: title, description, thumbnail (PhotoPicker). Save does POST (create) or PATCH (edit).
- **Curriculum tab**: modules with lessons table. Each lesson row has edit icon. Clicking expands InlineEditPanel below. "Add Lesson" expands a create form. "Add Module" input at bottom.
- **Settings tab**: pricing_type, price, is_published. Save does PATCH.
- In create mode, Curriculum tab shows a disabled message until course is saved.
- After creating a course, redirect to `/admin/courses/{slug}` so curriculum becomes available.

```tsx
"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clientFetch } from "@/lib/api-client"
import { BookOpen, Pencil, Plus, Trash2, X, ChevronDown, ChevronUp } from "lucide-react"
import { PhotoPicker } from "@/components/admin/photo-picker"
import { VideoPicker } from "@/components/admin/video-picker"
import { formatDuration } from "@/lib/format"
import type { Course, CourseDetail, Module, Lesson } from "@/types/course"
import type { Photo } from "@/types/photo"

interface CourseFormProps {
  course?: CourseDetail | null
  onCourseLoaded?: () => void
}

export function CourseForm({ course: initialCourse, onCourseLoaded }: CourseFormProps) {
  const router = useRouter()
  const isCreate = !initialCourse
  const [course, setCourse] = useState<CourseDetail | null>(initialCourse ?? null)
  const [saving, setSaving] = useState(false)

  // Create-mode form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    pricing_type: "free" as "free" | "paid",
    price: "0.00",
    is_published: false,
  })

  // Curriculum state
  const [newModuleTitle, setNewModuleTitle] = useState("")
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null)
  const [lessonSaving, setLessonSaving] = useState(false)
  const [addingLessonForModule, setAddingLessonForModule] = useState<number | null>(null)
  const [newLesson, setNewLesson] = useState({ title: "", content_html: "", is_free_preview: false, video: null as number | null, videoPreviewUrl: null as string | null })

  const slug = course?.slug

  // --- reload course data ---
  const loadCourse = useCallback(async () => {
    if (!slug) return
    try {
      const data = await clientFetch<CourseDetail>(`/api/v1/courses/${slug}/`)
      setCourse(data)
      onCourseLoaded?.()
    } catch (err) {
      console.error(err)
    }
  }, [slug, onCourseLoaded])

  // --- Details / Settings save ---
  async function handleSaveDetails() {
    if (isCreate) {
      // Create mode
      setSaving(true)
      try {
        const created = await clientFetch<Course>("/api/v1/courses/", {
          method: "POST",
          body: JSON.stringify(createForm),
        })
        router.push(`/admin/courses/${created.slug}`)
      } catch (err) {
        console.error(err)
      } finally {
        setSaving(false)
      }
      return
    }
    if (!course) return
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify({
          title: course.title,
          description: course.description,
          thumbnail_url: course.thumbnail_url,
          thumbnail: course.thumbnail_id || null,
        }),
      })
      await loadCourse()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSettings() {
    if (!course) return
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify({
          pricing_type: course.pricing_type,
          price: course.price,
          is_published: course.is_published,
        }),
      })
      await loadCourse()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // --- Module CRUD ---
  async function handleAddModule() {
    if (!newModuleTitle.trim() || !slug) return
    try {
      await clientFetch(`/api/v1/courses/${slug}/modules/`, {
        method: "POST",
        body: JSON.stringify({ title: newModuleTitle }),
      })
      setNewModuleTitle("")
      await loadCourse()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteModule(moduleId: number) {
    if (!slug) return
    try {
      await clientFetch(`/api/v1/courses/${slug}/modules/${moduleId}/`, { method: "DELETE" })
      await loadCourse()
    } catch (err) {
      console.error(err)
    }
  }

  // --- Lesson CRUD ---
  async function handleSaveLesson(lesson: Lesson, values: Record<string, unknown>) {
    if (!slug) return
    setLessonSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lesson.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          title: values.title,
          content_html: values.content_html,
          is_free_preview: values.is_free_preview,
          ...(values.video ? { video: values.video } : { video: null }),
        }),
      })
      setEditingLessonId(null)
      await loadCourse()
    } catch {
      // stays open on error
    } finally {
      setLessonSaving(false)
    }
  }

  async function handleCreateLesson(moduleId: number) {
    if (!slug || !newLesson.title.trim()) return
    setLessonSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/modules/${moduleId}/lessons/`, {
        method: "POST",
        body: JSON.stringify({
          title: newLesson.title,
          content_html: newLesson.content_html,
          is_free_preview: newLesson.is_free_preview,
          ...(newLesson.video ? { video: newLesson.video } : {}),
        }),
      })
      setAddingLessonForModule(null)
      setNewLesson({ title: "", content_html: "", is_free_preview: false, video: null, videoPreviewUrl: null })
      await loadCourse()
    } catch {
      // stays open on error
    } finally {
      setLessonSaving(false)
    }
  }

  async function handleDeleteLesson(lessonId: number) {
    if (!slug) return
    try {
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lessonId}/`, { method: "DELETE" })
      await loadCourse()
    } catch (err) {
      console.error(err)
    }
  }

  // Helper: the form data source depending on mode
  const formTitle = isCreate ? createForm.title : (course?.title ?? "")
  const formDescription = isCreate ? createForm.description : (course?.description ?? "")

  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* ───── Details Tab ───── */}
      <TabsContent value="details">
        <Card>
          <CardHeader>
            <CardTitle>Course Details</CardTitle>
            <CardDescription>
              {isCreate ? "Fill in the details to create a new course." : "Update the basic information for this course."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Introduction to Photography"
                value={formTitle}
                onChange={(e) =>
                  isCreate
                    ? setCreateForm({ ...createForm, title: e.target.value })
                    : setCourse(course ? { ...course, title: e.target.value } : course)
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what students will learn..."
                value={formDescription}
                onChange={(e) =>
                  isCreate
                    ? setCreateForm({ ...createForm, description: e.target.value })
                    : setCourse(course ? { ...course, description: e.target.value } : course)
                }
                className="min-h-[120px]"
              />
            </div>
            {!isCreate && course && (
              <div className="space-y-2">
                <Label>Thumbnail</Label>
                <PhotoPicker
                  value={course.thumbnail_url}
                  previewUrl={course.thumbnail_signed_url || course.thumbnail_url}
                  onSelect={(photo: Photo) => setCourse({ ...course, thumbnail_url: photo.s3_key, thumbnail_id: photo.id })}
                  onClear={() => setCourse({ ...course, thumbnail_url: "", thumbnail_id: null })}
                  label="Choose thumbnail"
                />
              </div>
            )}
            <Button onClick={handleSaveDetails} disabled={saving}>
              {saving ? "Saving..." : isCreate ? "Create Course" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ───── Curriculum Tab ───── */}
      <TabsContent value="curriculum">
        {isCreate || !course ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-4 text-sm text-muted-foreground">
                Save the course first to add modules and lessons.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {course.modules.map((mod: Module) => (
              <Card key={mod.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Module {mod.order}: {mod.title}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteModule(mod.id)}
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
                          <TableHead>Duration</TableHead>
                          <TableHead>Video</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mod.lessons.map((lesson) => (
                          <>
                            <TableRow key={lesson.id}>
                              <TableCell className="font-medium">{lesson.title}</TableCell>
                              <TableCell>{formatDuration(lesson.duration_seconds)}</TableCell>
                              <TableCell>
                                <Badge variant={lesson.video_url ? "success" : "secondary"}>
                                  {lesson.video_url ? "Uploaded" : "No video"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {lesson.is_free_preview && <Badge variant="outline">Free</Badge>}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditingLessonId(editingLessonId === lesson.id ? null : lesson.id)}
                                  >
                                    {editingLessonId === lesson.id ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleDeleteLesson(lesson.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {editingLessonId === lesson.id && (
                              <TableRow>
                                <TableCell colSpan={5} className="p-0">
                                  <LessonEditPanel
                                    lesson={lesson}
                                    onSave={(values) => handleSaveLesson(lesson, values)}
                                    onCancel={() => setEditingLessonId(null)}
                                    saving={lessonSaving}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {/* Add lesson inline */}
                  {addingLessonForModule === mod.id ? (
                    <LessonCreatePanel
                      newLesson={newLesson}
                      setNewLesson={setNewLesson}
                      onSave={() => handleCreateLesson(mod.id)}
                      onCancel={() => { setAddingLessonForModule(null); setNewLesson({ title: "", content_html: "", is_free_preview: false, video: null, videoPreviewUrl: null }) }}
                      saving={lessonSaving}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setAddingLessonForModule(mod.id)}
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
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddModule() }}
                  />
                  <Button className="gap-2 shrink-0" onClick={handleAddModule}>
                    <Plus className="h-4 w-4" /> Add Module
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </TabsContent>

      {/* ───── Settings Tab ───── */}
      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>Course Settings</CardTitle>
            <CardDescription>Configure pricing and publishing options.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pricing_type">Pricing Type</Label>
                <select
                  id="pricing_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={isCreate ? createForm.pricing_type : (course?.pricing_type ?? "free")}
                  onChange={(e) => {
                    const v = e.target.value as "free" | "paid"
                    isCreate
                      ? setCreateForm({ ...createForm, pricing_type: v })
                      : setCourse(course ? { ...course, pricing_type: v } : course)
                  }}
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings_price">Price</Label>
                <Input
                  id="settings_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={isCreate ? createForm.price : (course?.price ?? "0.00")}
                  onChange={(e) =>
                    isCreate
                      ? setCreateForm({ ...createForm, price: e.target.value })
                      : setCourse(course ? { ...course, price: e.target.value } : course)
                  }
                  disabled={(isCreate ? createForm.pricing_type : course?.pricing_type) === "free"}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="settings_published"
                checked={isCreate ? createForm.is_published : (course?.is_published ?? false)}
                onCheckedChange={(checked) =>
                  isCreate
                    ? setCreateForm({ ...createForm, is_published: checked })
                    : setCourse(course ? { ...course, is_published: checked } : course)
                }
              />
              <Label htmlFor="settings_published">{isCreate ? "Publish immediately" : "Published"}</Label>
            </div>
            <Button onClick={isCreate ? handleSaveDetails : handleSaveSettings} disabled={saving}>
              {saving ? "Saving..." : isCreate ? "Create Course" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

// ── Lesson Edit Panel (inline) ─────────────────────────────────

interface LessonEditPanelProps {
  lesson: Lesson
  onSave: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function LessonEditPanel({ lesson, onSave, onCancel, saving }: LessonEditPanelProps) {
  const [values, setValues] = useState({
    title: lesson.title,
    content_html: lesson.content_html,
    is_free_preview: lesson.is_free_preview,
    video: lesson.video_id,
    videoPreviewUrl: lesson.video_signed_url,
  })

  return (
    <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Title</Label>
          <Input
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={values.is_free_preview}
              onCheckedChange={(v) => setValues({ ...values, is_free_preview: v })}
            />
            <Label className="text-sm">Free Preview</Label>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Content (HTML)</Label>
        <Textarea
          value={values.content_html}
          onChange={(e) => setValues({ ...values, content_html: e.target.value })}
          className="min-h-[100px] font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Video</Label>
        <VideoPicker
          value={values.video}
          previewUrl={values.videoPreviewUrl}
          onChange={(videoId, signedUrl) => setValues({ ...values, video: videoId, videoPreviewUrl: signedUrl })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(values)} disabled={saving || !values.title.trim()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}

// ── Lesson Create Panel (inline) ───────────────────────────────

interface LessonCreatePanelProps {
  newLesson: { title: string; content_html: string; is_free_preview: boolean; video: number | null; videoPreviewUrl: string | null }
  setNewLesson: (val: { title: string; content_html: string; is_free_preview: boolean; video: number | null; videoPreviewUrl: string | null }) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

function LessonCreatePanel({ newLesson, setNewLesson, onSave, onCancel, saving }: LessonCreatePanelProps) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-4">
      <p className="text-sm font-medium">New Lesson</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Title</Label>
          <Input
            value={newLesson.title}
            onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })}
            placeholder="Lesson title"
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={newLesson.is_free_preview}
              onCheckedChange={(v) => setNewLesson({ ...newLesson, is_free_preview: v })}
            />
            <Label className="text-sm">Free Preview</Label>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Content (HTML)</Label>
        <Textarea
          value={newLesson.content_html}
          onChange={(e) => setNewLesson({ ...newLesson, content_html: e.target.value })}
          className="min-h-[100px] font-mono text-xs"
          placeholder="Optional lesson content..."
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Video</Label>
        <VideoPicker
          value={newLesson.video}
          previewUrl={newLesson.videoPreviewUrl}
          onChange={(videoId, signedUrl) => setNewLesson({ ...newLesson, video: videoId, videoPreviewUrl: signedUrl })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving || !newLesson.title.trim()}>
          {saving ? "Adding..." : "Add Lesson"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend-customer && npx next build`

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/course-form.tsx
git commit -m "feat: add unified CourseForm component with inline lesson editing"
```

---

## Chunk 3: Page Rewrites + Cleanup

### Task 4: Rewrite the course create page

**Files:**
- Modify: `src/app/admin/courses/new/page.tsx`

- [ ] **Step 1: Replace contents**

```tsx
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CourseForm } from '@/components/admin/course-form'

export default function NewCoursePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/courses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Course</h1>
          <p className="text-sm text-muted-foreground">
            Fill in the details below to create a new course.
          </p>
        </div>
      </div>

      <CourseForm />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/app/admin/courses/new/page.tsx
git commit -m "refactor: simplify course create page to use CourseForm"
```

---

### Task 5: Rewrite the course edit page

**Files:**
- Modify: `src/app/admin/courses/[slug]/page.tsx`

- [ ] **Step 1: Replace contents**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { clientFetch } from '@/lib/api-client'
import { ArrowLeft } from 'lucide-react'
import { CourseForm } from '@/components/admin/course-form'
import type { CourseDetail } from '@/types/course'

export default function AdminCourseDetailPage() {
  const params = useParams<{ slug: string }>()
  const [course, setCourse] = useState<CourseDetail | null>(null)

  useEffect(() => {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then(setCourse)
      .catch(console.error)
  }, [params.slug])

  function reload() {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then(setCourse)
      .catch(console.error)
  }

  if (!course) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/courses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Edit Course</h1>
          <p className="text-sm text-muted-foreground">{course.title}</p>
        </div>
        <Badge variant={course.is_published ? 'success' : 'secondary'}>
          {course.is_published ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <CourseForm course={course} onCourseLoaded={reload} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/app/admin/courses/[slug]/page.tsx
git commit -m "refactor: simplify course edit page to use CourseForm"
```

---

### Task 6: Delete old lesson edit page and video uploader

**Files:**
- Delete: `src/app/admin/courses/[slug]/lessons/[lessonId]/page.tsx`
- Delete: `src/components/admin/video-uploader.tsx`

- [ ] **Step 1: Remove the lesson edit page**

```bash
rm frontend-customer/src/app/admin/courses/\[slug\]/lessons/\[lessonId\]/page.tsx
```

Check if the `[lessonId]` and `lessons` directories are now empty and remove them:

```bash
rmdir frontend-customer/src/app/admin/courses/\[slug\]/lessons/\[lessonId\]/
rmdir frontend-customer/src/app/admin/courses/\[slug\]/lessons/
```

- [ ] **Step 2: Remove the video uploader component**

```bash
rm frontend-customer/src/components/admin/video-uploader.tsx
```

- [ ] **Step 3: Check for remaining references**

Search for `video-uploader` and `lessons/[lessonId]` in the codebase. Remove any remaining imports or links.

- [ ] **Step 4: Verify build**

Run: `cd frontend-customer && npx next build`

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: remove separate lesson edit page and video-uploader (replaced by inline editing)"
```

---

### Task 7: Final build verification

- [ ] **Step 1: Full build**

Run: `cd frontend-customer && npx next build`
Expected: Succeeds with no errors

- [ ] **Step 2: Smoke test all flows**

1. `/admin/courses/new` — Verify 3 tabs visible. Details tab has title, description. Settings tab has pricing, price, published. Curriculum tab shows "save first" message.
2. Create a course → redirects to edit page with all 3 tabs
3. Edit page: Details tab has title, description, thumbnail (PhotoPicker)
4. Curriculum tab: modules listed, lessons in table, edit icon expands inline form with title, content_html, is_free_preview, VideoPicker
5. Add Lesson: click button, form appears inline with all fields + VideoPicker
6. Settings tab: pricing, price, published, save works
7. `/admin/courses` list page: inline edit and detail link both still work

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: course form polish"
```
