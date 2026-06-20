"use client"

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { BookOpen, ExternalLink, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { clientFetch, batchedAsync } from "@/lib/api-client"
import { toast } from "sonner"
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
  type BulkSelection,
} from "@/components/admin/media-browser"
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import { TagFilterBar } from "@/components/admin/tag-filter-bar"
import type { Course } from "@/types/course"

export const dynamic = "force-dynamic"

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
]

const courseFields: FieldConfig<Course>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  {
    key: "pricing_type",
    label: "Pricing",
    type: "select",
    options: [
      { label: "Free", value: "free" },
      { label: "Paid", value: "paid" },
    ],
  },
  { key: "price", label: "Price", type: "number", placeholder: "0.00", showWhen: (v) => v.pricing_type === "paid" },
  { key: "is_published", label: "Published", type: "toggle" },
  { key: "thumbnail_id", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]

export default function AdminCoursesPage() {
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tagFilter, setTagFilter] = useState<number[]>([])

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Course>> => {
      const sp = new URLSearchParams()
      sp.set("limit", String(params.limit))
      sp.set("offset", String(params.offset))
      sp.set("ordering", params.ordering)
      if (params.search) sp.set("search", params.search)
      if (tagFilter.length) sp.set("tags", tagFilter.join(","))
      const data = await clientFetch<
        | { results: Course[]; next: string | null; count: number }
        | Course[]
      >(`/api/v1/courses/?${sp.toString()}`)

      if (Array.isArray(data)) {
        return { results: data, next: null, count: data.length }
      }
      return { results: data.results, next: data.next, count: data.count }
    },
    [tagFilter]
  )

  async function handleBulkDelete(selection: BulkSelection) {
    await batchedAsync(
      selection.ids.map((slug) => () =>
        clientFetch(`/api/v1/courses/${slug}/`, { method: "DELETE" }).catch(
          () => {}
        )
      )
    )
    toast.success("Courses deleted")
    browserRef.current?.refresh()
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/courses/${editingSlug}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          pricing_type: values.pricing_type,
          is_published: values.is_published,
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
          ...(values.thumbnail_id ? { thumbnail: values.thumbnail_id } : {}),
        }),
      })
      toast.success("Course updated")
      setEditingSlug(null)
      browserRef.current?.refresh()
    } catch {
      toast.error("Failed to update course")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Manage your course catalog.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/admin/courses/new">
            <Plus className="h-4 w-4" />
            New Course
          </Link>
        </Button>
      </div>

      <MediaBrowser<Course>
        ref={browserRef}
        persistKey="courses"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={<TagFilterBar scope="course" value={tagFilter} onChange={setTagFilter} />}
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        emptyIcon={BookOpen}
        emptyMessage="No courses yet. Create your first course to get started."
        getItemId={(c) => c.slug}
        onDelete={handleBulkDelete}
        listColumns={[
          { label: "Title", key: "title" },
          { label: "Status", key: "status" },
          { label: "Pricing", key: "pricing" },
          { label: "Lessons", key: "lessons" },
          { label: "Actions", key: "actions" },
        ]}
        renderGalleryItem={(course, _selected) => (
          <Link
            href={`/admin/courses/${course.slug}`}
            className="group block overflow-hidden rounded-lg border bg-card"
          >
            {course.thumbnail_signed_url ? (
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={course.thumbnail_signed_url}
                  alt={course.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <BookOpen className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-3 space-y-2">
              <p className="font-medium truncate">{course.title}</p>
              <div className="flex items-center gap-2">
                <Badge
                  variant={course.is_published ? "success" : "secondary"}
                >
                  {course.is_published ? "Published" : "Draft"}
                </Badge>
                <Badge
                  variant={
                    course.pricing_type === "free" ? "outline" : "default"
                  }
                >
                  {course.pricing_type === "free"
                    ? "Free"
                    : course.pricing_type === "paid"
                      ? `$${course.price}`
                      : "Subscription"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {course.lesson_count ?? 0} lessons
                </span>
              </div>
            </div>
          </Link>
        )}
        renderListRow={(course) => (
          <>
            <TableCell className="font-medium">{course.title}</TableCell>
            <TableCell>
              <Badge
                variant={course.is_published ? "success" : "secondary"}
              >
                {course.is_published ? "Published" : "Draft"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  course.pricing_type === "free" ? "outline" : "default"
                }
              >
                {course.pricing_type === "free"
                  ? "Free"
                  : course.pricing_type === "paid"
                    ? `$${course.price}`
                    : "Subscription"}
              </Badge>
            </TableCell>
            <TableCell>{course.lesson_count ?? 0}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEditingSlug(course.slug)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button asChild variant="ghost" size="icon">
                  <Link href={`/admin/courses/${course.slug}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(course) =>
          editingSlug === course.slug ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={course}
                  fields={courseFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingSlug(null)}
                  saving={saving}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  )
}
