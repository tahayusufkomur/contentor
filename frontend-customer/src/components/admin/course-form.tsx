"use client"

import { useState, useCallback, Fragment } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clientFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { ChevronUp, Pencil, Plus, Trash2 } from "lucide-react"
import { PhotoPicker } from "@/components/admin/photo-picker"
import { VideoPicker } from "@/components/admin/video-picker"
import { FilterPicker } from "@/components/admin/filter-picker"
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
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>(
    initialCourse?.filter_options?.map((o) => o.id) ?? [],
  )

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
  const [newLesson, setNewLesson] = useState({
    title: "",
    content_html: "",
    is_free_preview: false,
    video: null as number | null,
    videoPreviewUrl: null as string | null,
  })

  const slug = course?.slug

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

  // --- Save all course fields ---
  async function handleSave() {
    if (isCreate) {
      setSaving(true)
      try {
        const created = await clientFetch<Course>("/api/v1/courses/", {
          method: "POST",
          body: JSON.stringify({ ...createForm, filter_option_ids: filterOptionIds }),
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
    if (!course) return
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: course.title,
          description: course.description,
          thumbnail_url: course.thumbnail_url,
          thumbnail: course.thumbnail_id || null,
          pricing_type: course.pricing_type,
          price: course.price,
          is_published: course.is_published,
          filter_option_ids: filterOptionIds,
        }),
      })
      toast.success("Course saved")
      await loadCourse()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save course")
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
      toast.success("Module added")
      await loadCourse()
    } catch (err) {
      console.error(err)
      toast.error("Failed to add module")
    }
  }

  async function handleDeleteModule(moduleId: number) {
    if (!slug) return
    try {
      await clientFetch(`/api/v1/courses/${slug}/modules/${moduleId}/`, { method: "DELETE" })
      toast.success("Module deleted")
      await loadCourse()
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete module")
    }
  }

  // --- Lesson CRUD ---
  async function handleSaveLesson(lesson: Lesson, values: Record<string, unknown>) {
    if (!slug) return
    setLessonSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lesson.id}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          content_html: values.content_html,
          is_free_preview: values.is_free_preview,
          ...(values.video ? { video: values.video } : { video: null }),
        }),
      })
      setEditingLessonId(null)
      toast.success("Lesson saved")
      await loadCourse()
    } catch {
      toast.error("Failed to save lesson")
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
      toast.success("Lesson added")
      await loadCourse()
    } catch {
      toast.error("Failed to add lesson")
    } finally {
      setLessonSaving(false)
    }
  }

  async function handleDeleteLesson(lessonId: number) {
    if (!slug) return
    try {
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lessonId}/`, { method: "DELETE" })
      toast.success("Lesson deleted")
      await loadCourse()
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete lesson")
    }
  }

  return (
    <div className="space-y-6">
      {/* ───── Course Details & Settings ───── */}
      <Card>
        <CardHeader>
          <CardTitle>{isCreate ? "New Course" : "Course Settings"}</CardTitle>
          <CardDescription>
            {isCreate ? "Fill in the details to create a new course." : "Update course details, pricing, and publishing."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Introduction to Photography"
              value={isCreate ? createForm.title : (course?.title ?? "")}
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
              value={isCreate ? createForm.description : (course?.description ?? "")}
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
                onSelect={(photo: Photo) =>
                  setCourse({ ...course, thumbnail_url: photo.s3_key, thumbnail_id: photo.id })
                }
                onClear={() => setCourse({ ...course, thumbnail_url: "", thumbnail_id: null })}
                label="Choose thumbnail"
              />
            </div>
          )}
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
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={isCreate ? createForm.price : (course?.price ?? "0.00")}
                onChange={(e) =>
                  isCreate
                    ? setCreateForm({ ...createForm, price: e.target.value })
                    : setCourse(course ? { ...course, price: e.target.value } : course)
                }
                disabled={
                  (isCreate ? createForm.pricing_type : course?.pricing_type) === "free"
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="published"
              checked={isCreate ? createForm.is_published : (course?.is_published ?? false)}
              onCheckedChange={(checked) =>
                isCreate
                  ? setCreateForm({ ...createForm, is_published: checked })
                  : setCourse(course ? { ...course, is_published: checked } : course)
              }
            />
            <Label htmlFor="published">
              {isCreate ? "Publish immediately" : "Published"}
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label>Filters</Label>
            <FilterPicker value={filterOptionIds} onChange={setFilterOptionIds} scope="course" />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isCreate ? "Create Course" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* ───── Curriculum ───── */}
      {!isCreate && course && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Curriculum</CardTitle>
              <CardDescription>Organize your course into modules and lessons.</CardDescription>
            </CardHeader>
          </Card>

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
                        <Fragment key={lesson.id}>
                          <TableRow>
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
                                  onClick={() =>
                                    setEditingLessonId(
                                      editingLessonId === lesson.id ? null : lesson.id
                                    )
                                  }
                                >
                                  {editingLessonId === lesson.id ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <Pencil className="h-4 w-4" />
                                  )}
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
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {addingLessonForModule === mod.id ? (
                  <LessonCreatePanel
                    newLesson={newLesson}
                    setNewLesson={setNewLesson}
                    onSave={() => handleCreateLesson(mod.id)}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddModule()
                  }}
                />
                <Button className="gap-2 shrink-0" onClick={handleAddModule}>
                  <Plus className="h-4 w-4" /> Add Module
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
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
          onChange={(videoId, signedUrl) =>
            setValues({ ...values, video: videoId, videoPreviewUrl: signedUrl })
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(values)}
          disabled={saving || !values.title.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}

// ── Lesson Create Panel (inline) ───────────────────────────────

interface NewLessonState {
  title: string
  content_html: string
  is_free_preview: boolean
  video: number | null
  videoPreviewUrl: string | null
}

interface LessonCreatePanelProps {
  newLesson: NewLessonState
  setNewLesson: (val: NewLessonState) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

function LessonCreatePanel({
  newLesson,
  setNewLesson,
  onSave,
  onCancel,
  saving,
}: LessonCreatePanelProps) {
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
              onCheckedChange={(v) =>
                setNewLesson({ ...newLesson, is_free_preview: v })
              }
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
          onChange={(videoId, signedUrl) =>
            setNewLesson({ ...newLesson, video: videoId, videoPreviewUrl: signedUrl })
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !newLesson.title.trim()}>
          {saving ? "Adding..." : "Add Lesson"}
        </Button>
      </div>
    </div>
  )
}
