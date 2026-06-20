"use client"

import { useCallback, useRef, useState } from "react"
import {
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { clientFetch, batchedAsync } from "@/lib/api-client"
import { toast } from "sonner"
import { formatFileSize, formatDate } from "@/lib/format"
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser"
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import type { Photo } from "@/types/photo"

export const dynamic = "force-dynamic"

interface PresignResponse {
  upload_url: string
  s3_key: string
}

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
  { label: "Largest", value: "-file_size" },
  { label: "Smallest", value: "file_size" },
]

export default function PhotosPage() {
  const browserRef = useRef<MediaBrowserHandle>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Photo>> => {
      const sp = new URLSearchParams()
      sp.set("limit", String(params.limit))
      sp.set("offset", String(params.offset))
      sp.set("ordering", params.ordering)
      if (params.search) sp.set("search", params.search)
      const data = await clientFetch<{
        results: Photo[]
        next: string | null
        count: number
      }>(`/api/v1/photos/?${sp.toString()}`)
      return { results: data.results, next: data.next, count: data.count }
    },
    []
  )

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      const { upload_url, s3_key } = await clientFetch<PresignResponse>(
        "/api/v1/upload/presign/",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category: "photo",
          }),
        }
      )
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", upload_url)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(file)
      })
      await clientFetch("/api/v1/upload/complete/", {
        method: "POST",
        body: JSON.stringify({
          s3_key,
          category: "photo",
          content_type: file.type,
          file_size: file.size,
          title: file.name.replace(/\.[^.]+$/, ""),
        }),
      })
      toast.success("Photo uploaded")
      browserRef.current?.refresh()
    } catch (err) {
      console.error(err)
      toast.error("Failed to upload photo")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const photoFields: FieldConfig<Photo>[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "alt_text", label: "Alt Text", type: "text" },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "photo" },
  ]

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await clientFetch(`/api/v1/photos/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          alt_text: values.alt_text,
          tag_ids: values.tag_ids ?? [],
        }),
      })
      toast.success("Photo updated")
      setEditingId(null)
      browserRef.current?.refresh()
    } catch {
      toast.error("Failed to update photo")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await clientFetch(`/api/v1/photos/${id}/`, { method: "DELETE" })
      toast.success("Photo deleted")
      browserRef.current?.refresh()
    } catch {
      toast.error("Failed to delete photo")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Photos</h1>
          <p className="text-sm text-muted-foreground">
            Manage your photo library.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            className="gap-2"
            disabled={uploading}
          >
            <Plus className="h-4 w-4" /> Upload Photo
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {uploadProgress}% uploaded
          </p>
        </div>
      )}

      <MediaBrowser<Photo>
        ref={browserRef}
        persistKey="photos"
        fetchPage={fetchPage}
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        emptyIcon={ImageIcon}
        emptyMessage="No photos yet. Upload one to get started."
        getItemId={(p) => p.id}
        onDelete={async (selection) => {
          let ids = selection.ids
          if (selection.mode === "all") {
            ids = []
            let offset = 0
            while (true) {
              const sp = new URLSearchParams()
              sp.set("limit", "100")
              sp.set("offset", String(offset))
              sp.set("ordering", selection.ordering)
              if (selection.search) sp.set("search", selection.search)
              const data = await clientFetch<{
                results: Photo[]
                next: string | null
              }>(`/api/v1/photos/?${sp}`)
              ids.push(...data.results.map((p) => p.id))
              if (!data.next) break
              offset += 100
            }
          }
          await batchedAsync(
            ids.map((id) => () =>
              clientFetch(`/api/v1/photos/${id}/`, { method: "DELETE" })
            )
          )
          toast.success("Photos deleted")
          browserRef.current?.refresh()
        }}
        listColumns={[
          { label: "Photo", key: "photo" },
          { label: "Title", key: "title" },
          { label: "Size", key: "size" },
          { label: "Date", key: "date" },
          { label: "Actions", key: "actions" },
        ]}
        renderGalleryItem={(photo, _selected) => (
          <div className="group overflow-hidden rounded-lg border bg-card">
            {photo.signed_url ? (
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={photo.signed_url}
                  alt={photo.alt_text || photo.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-3 space-y-2">
              <p className="font-medium truncate">
                {photo.title || "Untitled"}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatFileSize(photo.file_size)}</span>
                <span>{formatDate(photo.created_at)}</span>
              </div>
            </div>
          </div>
        )}
        renderListRow={(photo) => (
          <>
            <TableCell className="w-16">
              {photo.signed_url ? (
                <img
                  src={photo.signed_url}
                  alt={photo.alt_text || photo.title}
                  className="h-10 w-14 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-14 items-center justify-center rounded bg-muted">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                </div>
              )}
            </TableCell>
            <TableCell className="font-medium">
              {photo.title || "Untitled"}
            </TableCell>
            <TableCell>{formatFileSize(photo.file_size)}</TableCell>
            <TableCell>{formatDate(photo.created_at)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(photo.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(photo.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(photo) =>
          editingId === photo.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={{ ...photo, tag_ids: (photo.tags ?? []).map((t) => t.id) }}
                  fields={photoFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingId(null)}
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
