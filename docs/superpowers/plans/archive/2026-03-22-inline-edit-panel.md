# Inline Edit Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all per-page edit UI in admin with a shared `InlineEditPanel<T>` component that expands below the row.

**Architecture:** A generic `InlineEditPanel` component renders a form from a declarative field config. MediaBrowser gets a new `renderExpandedRow` prop to inject the panel below list rows. Each admin page defines its field config and wires `onSave` to its API endpoint. A `PhotoPicker` sub-component handles the `image` field type.

**Tech Stack:** React 19, TypeScript, shadcn/ui, Next.js App Router, clientFetch

**Spec:** `docs/superpowers/specs/2026-03-22-inline-edit-panel-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/ui/textarea.tsx` | Create | shadcn Textarea primitive |
| `src/components/admin/inline-edit-panel.tsx` | Create | Generic inline edit form component |
| `src/components/admin/photo-picker.tsx` | Create | Minimal photo picker for image field type |
| `src/components/admin/media-browser.tsx` | Modify | Add `renderExpandedRow` prop |
| `src/app/admin/videos/page.tsx` | Modify | Replace inline edit with InlineEditPanel |
| `src/app/admin/downloads/page.tsx` | Modify | Replace inline edit with InlineEditPanel |
| `src/app/admin/photos/page.tsx` | Modify | Replace inline edit with InlineEditPanel |
| `src/app/admin/live/page.tsx` | Modify | Replace edit form panels with InlineEditPanel (all 4 tabs) |
| `src/app/admin/courses/page.tsx` | Modify | Add InlineEditPanel (currently only has link to detail page) |

All paths relative to `frontend-customer/`.

---

## Chunk 1: Foundation Components

### Task 1: Add shadcn Textarea component

**Files:**
- Create: `src/components/ui/textarea.tsx`

- [ ] **Step 1: Create Textarea component**

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend-customer && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/ui/textarea.tsx
git commit -m "feat: add shadcn Textarea component"
```

---

### Task 2: Add `renderExpandedRow` to MediaBrowser

**Files:**
- Modify: `src/components/admin/media-browser.tsx`

The current list-view rendering loop (lines 663-688) wraps each item in a single `<TableRow>`. We need to wrap it in a `<React.Fragment>` and render an optional expanded row after it.

- [ ] **Step 1: Add `renderExpandedRow` to `MediaBrowserProps` interface**

At line 98 (after `renderListRow`), add:

```typescript
renderExpandedRow?: (item: T) => ReactNode | null
```

- [ ] **Step 2: Update the list-view items.map loop**

Replace the list-view items.map block (lines 663-688). The current code returns a single `<TableRow>`. Change it to return a `<React.Fragment>` containing the original `<TableRow>` plus the expanded row:

```tsx
{items.map((item, i) => {
  const id = getItemId?.(item)
  const isSelected =
    selectAllMode || (id !== undefined && selectedIds.has(id))
  const isFading = id !== undefined && fadingIds.has(id)
  return (
    <React.Fragment key={id ?? i}>
      <TableRow
        className={cn(
          "transition-all duration-300",
          isSelected && "bg-muted/50",
          isFading && "opacity-0 scale-y-0 h-0"
        )}
      >
        {selectable && id !== undefined && (
          <td className="px-4 py-2">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelect(id)}
            />
          </td>
        )}
        {renderListRow(item)}
      </TableRow>
      {renderExpandedRow?.(item)}
    </React.Fragment>
  )
})}
```

- [ ] **Step 3: Destructure `renderExpandedRow` from props**

Find where `MediaBrowserProps` is destructured inside the component (the `forwardRef` function params) and add `renderExpandedRow` to the destructuring.

- [ ] **Step 4: Verify it builds**

Run: `cd frontend-customer && npx next build`
Expected: Build succeeds. No behavior change since no page passes the prop yet.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/admin/media-browser.tsx
git commit -m "feat: add renderExpandedRow prop to MediaBrowser"
```

---

### Task 3: Create PhotoPicker component

**Files:**
- Create: `src/components/admin/photo-picker.tsx`

A minimal inline photo picker. Shows current thumbnail + "Choose" button. Clicking opens a small dropdown/popover with search and photo grid. Selecting a photo calls `onChange` with the photo ID and signed URL.

- [ ] **Step 1: Create PhotoPicker component**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api-client"
import { ImageIcon, X } from "lucide-react"

interface Photo {
  id: string
  signed_url: string
  title: string
}

interface PhotoPickerProps {
  value: string | null
  previewUrl: string | null
  onChange: (photoId: string | null, signedUrl: string | null) => void
}

export function PhotoPicker({ value, previewUrl, onChange }: PhotoPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchPhotos = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "20", offset: "0" })
      if (q) params.set("search", q)
      const res = await clientFetch<{ results: Photo[] }>(
        `/api/v1/photos/?${params}`
      )
      setPhotos(res.results)
    } catch {
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchPhotos(search)
  }, [open, search, fetchPhotos])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-12 w-12 rounded-md border object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            Choose
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null, null)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover p-3 shadow-lg">
          <Input
            placeholder="Search photos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-8"
          />
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading...
            </p>
          ) : photos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No photos found
            </p>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="overflow-hidden rounded-md border hover:ring-2 hover:ring-primary focus:ring-2 focus:ring-primary"
                  onClick={() => {
                    onChange(photo.id, photo.signed_url)
                    setOpen(false)
                  }}
                >
                  <img
                    src={photo.signed_url}
                    alt={photo.title}
                    className="h-16 w-16 object-cover"
                  />
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
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/photo-picker.tsx
git commit -m "feat: add PhotoPicker component for image field type"
```

---

### Task 4: Create InlineEditPanel component

**Files:**
- Create: `src/components/admin/inline-edit-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PhotoPicker } from "@/components/admin/photo-picker"
import { Loader2 } from "lucide-react"

// --- Types ---

export interface FieldConfig<T> {
  key: keyof T & string
  label: string
  type: "text" | "number" | "select" | "toggle" | "datetime" | "textarea" | "image"
  options?: { label: string; value: string }[]
  showWhen?: (values: Record<string, unknown>) => boolean
  placeholder?: string
  required?: boolean
  /** For image fields: the key on the item that holds the preview URL */
  previewUrlKey?: keyof T & string
}

export interface InlineEditPanelProps<T> {
  item: T
  fields: FieldConfig<T>[]
  onSave: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

// --- Component ---

export function InlineEditPanel<T extends Record<string, unknown>>({
  item,
  fields,
  onSave,
  onCancel,
  saving = false,
}: InlineEditPanelProps<T>) {
  // Initialize form values from item
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) {
      init[f.key] = item[f.key] ?? (f.type === "toggle" ? false : "")
    }
    return init
  })

  // Track preview URLs for image fields separately
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {}
    for (const f of fields) {
      if (f.type === "image" && f.previewUrlKey) {
        init[f.key] = (item[f.previewUrlKey] as string) ?? null
      }
    }
    return init
  })

  const setValue = useCallback((key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }, [])

  // Escape to cancel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const handleSubmit = async () => {
    await onSave(values)
  }

  const hasEmptyRequired = fields.some(
    (f) =>
      f.required &&
      (!f.showWhen || f.showWhen(values)) &&
      (values[f.key] === "" || values[f.key] === null || values[f.key] === undefined)
  )

  const visibleFields = fields.filter((f) => !f.showWhen || f.showWhen(values))

  return (
    <div className="border-t bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleFields.map((field) => (
          <div
            key={field.key}
            className={
              field.type === "textarea" || field.type === "image"
                ? "sm:col-span-2 lg:col-span-3"
                : ""
            }
          >
            <Label htmlFor={`edit-${field.key}`} className="mb-1.5 block text-sm font-medium">
              {field.label}
            </Label>

            {field.type === "text" && (
              <Input
                id={`edit-${field.key}`}
                value={(values[field.key] as string) ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {field.type === "number" && (
              <Input
                id={`edit-${field.key}`}
                type="number"
                value={(values[field.key] as string) ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {field.type === "textarea" && (
              <Textarea
                id={`edit-${field.key}`}
                value={(values[field.key] as string) ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
              />
            )}

            {field.type === "select" && (
              <Select
                value={(values[field.key] as string) ?? ""}
                onValueChange={(v) => setValue(field.key, v)}
              >
                <SelectTrigger id={`edit-${field.key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.type === "toggle" && (
              <Switch
                id={`edit-${field.key}`}
                checked={!!values[field.key]}
                onCheckedChange={(v) => setValue(field.key, v)}
              />
            )}

            {field.type === "datetime" && (
              <Input
                id={`edit-${field.key}`}
                type="datetime-local"
                value={(values[field.key] as string) ?? ""}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}

            {field.type === "image" && (
              <PhotoPicker
                value={(values[field.key] as string) ?? null}
                previewUrl={imagePreviewUrls[field.key] ?? null}
                onChange={(photoId, signedUrl) => {
                  setValue(field.key, photoId)
                  setImagePreviewUrls((prev) => ({ ...prev, [field.key]: signedUrl }))
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={saving || hasEmptyRequired}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend-customer && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/inline-edit-panel.tsx
git commit -m "feat: add shared InlineEditPanel component"
```

---

## Chunk 2: Integrate into Simple Pages (Videos, Downloads, Photos)

### Task 5: Integrate InlineEditPanel into Videos page

**Files:**
- Modify: `src/app/admin/videos/page.tsx`

- [ ] **Step 1: Remove old edit state and functions**

Remove these state variables:
- `editingId` (line 88)
- `title` (line 86) — only the edit-related usage; the upload form also uses `title`, so check if it's shared. Looking at the code: `title` and `description` are shared between upload and edit. We need to keep them for the upload form but remove the edit usage.

Actually, `title`/`description` state is used for both upload and edit. The cleanest approach: keep `title`/`description` for the upload form only. Remove `editingId`. Remove `startEdit`, `handleUpdate`, `resetForm` (which also resets edit state).

Specifically:
- Remove `const [editingId, setEditingId] = useState<number | null>(null)` (line 88)
- Remove `startEdit` function (lines 213-217)
- Remove `handleUpdate` function (lines 191-202)
- Simplify `resetForm` to only reset upload-related state (remove `setEditingId(null)`)
- Add new state: `const [editingId, setEditingId] = useState<number | null>(null)` and `const [saving, setSaving] = useState(false)` for the inline panel

- [ ] **Step 2: Add InlineEditPanel imports and edit handler**

Add imports:
```tsx
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import { TableRow, TableCell } from "@/components/ui/table"
```

Add field config and save handler:
```tsx
const videoFields: FieldConfig<VideoItem>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]

async function handleInlineUpdate(values: Record<string, unknown>) {
  setSaving(true)
  try {
    await clientFetch(`/api/v1/courses/videos/${editingId}/`, {
      method: "PUT",
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        ...(values.thumbnail ? { thumbnail: values.thumbnail } : {}),
      }),
    })
    setEditingId(null)
    browserRef.current?.refresh()
  } catch {
    // stays open on error
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Replace renderListRow edit UI**

Remove the `editingId === video.id` conditional rendering in `renderListRow` (lines 583-607). Replace with always showing the normal view. Keep the pencil icon but change it from `startEdit` to `setEditingId`:

```tsx
renderListRow={(video) => (
  <>
    <TableCell>
      <div className="flex items-center gap-3">
        {/* thumbnail */}
        <p className="font-medium">{video.title}</p>
      </div>
    </TableCell>
    <TableCell>{video.duration_seconds ? formatDuration(video.duration_seconds) : "—"}</TableCell>
    <TableCell>{video.file_size ? formatFileSize(video.file_size) : "—"}</TableCell>
    <TableCell>{formatDate(video.created_at)}</TableCell>
    <TableCell>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setEditingId(video.id)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </TableCell>
  </>
)}
```

- [ ] **Step 4: Add renderExpandedRow**

```tsx
renderExpandedRow={(video) =>
  editingId === video.id ? (
    <TableRow>
      <TableCell colSpan={6} className="p-0">
        <InlineEditPanel
          item={video}
          fields={videoFields}
          onSave={handleInlineUpdate}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      </TableCell>
    </TableRow>
  ) : null
}
```

- [ ] **Step 5: Replace renderGalleryItem edit UI**

Remove the `editingId === video.id` conditional in `renderGalleryItem` (lines 505-536). Always show the normal view. Add an edit button to the gallery card that switches to list view or sets editingId (gallery edit is not supported per spec — remove the edit icon from gallery items).

- [ ] **Step 6: Verify it builds**

Run: `cd frontend-customer && npx next build`
Expected: Build succeeds

- [ ] **Step 7: Manually test in browser**

1. Go to `/admin/videos`
2. Click pencil icon on a video row
3. Verify panel expands below with title, description, thumbnail fields
4. Edit title, click Save — verify it updates
5. Click Cancel or Escape — verify panel closes
6. Click edit on another video — verify first panel closes

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/app/admin/videos/page.tsx
git commit -m "feat: replace videos inline edit with InlineEditPanel"
```

---

### Task 6: Integrate InlineEditPanel into Downloads page

**Files:**
- Modify: `src/app/admin/downloads/page.tsx`

- [ ] **Step 1: Remove old edit state**

Remove: `editingId`, `editTitle`, `editAccess` state variables, `startEdit`, `handleUpdate` functions.

Add: `editingId` state and `saving` state for the panel.

- [ ] **Step 2: Add field config and save handler**

```tsx
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import { TableRow, TableCell } from "@/components/ui/table"

const downloadFields: FieldConfig<DownloadFile>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  {
    key: "pricing_type",
    label: "Access",
    type: "select",
    options: [
      { label: "Free", value: "free" },
      { label: "Paid", value: "paid" },
    ],
  },
  {
    key: "price",
    label: "Price",
    type: "number",
    placeholder: "0.00",
    showWhen: (v) => v.pricing_type === "paid",
  },
]

async function handleInlineUpdate(values: Record<string, unknown>) {
  setSaving(true)
  try {
    await clientFetch(`/api/v1/downloads/${editingId}/`, {
      method: "PATCH",
      body: JSON.stringify({
        title: values.title,
        pricing_type: values.pricing_type,
        ...(values.pricing_type === "paid" ? { price: parseFloat(values.price as string) } : {}),
      }),
    })
    setEditingId(null)
    browserRef.current?.refresh()
  } catch {
    // stays open
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Replace renderListRow and renderGalleryItem edit UI**

Same pattern as videos: remove `editingId === dl.id` conditional, always show normal view, pencil icon sets `editingId`.

- [ ] **Step 4: Add renderExpandedRow**

```tsx
renderExpandedRow={(dl) =>
  editingId === dl.id ? (
    <TableRow>
      <TableCell colSpan={6} className="p-0">
        <InlineEditPanel
          item={dl}
          fields={downloadFields}
          onSave={handleInlineUpdate}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      </TableCell>
    </TableRow>
  ) : null
}
```

- [ ] **Step 5: Verify build and test in browser**

Run: `cd frontend-customer && npx next build`
Test: Edit a download's title and access type via inline panel.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/admin/downloads/page.tsx
git commit -m "feat: replace downloads inline edit with InlineEditPanel"
```

---

### Task 7: Integrate InlineEditPanel into Photos page

**Files:**
- Modify: `src/app/admin/photos/page.tsx`

- [ ] **Step 1: Remove old edit state**

Remove: `editingId`, `title`, `altText` state (keep upload-related state), `startEdit`, `handleUpdate`.
Add: `editingId` (string | null for UUID), `saving`.

- [ ] **Step 2: Add field config and save handler**

```tsx
const photoFields: FieldConfig<Photo>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "alt_text", label: "Alt Text", type: "text" },
]

async function handleInlineUpdate(values: Record<string, unknown>) {
  setSaving(true)
  try {
    await clientFetch(`/api/v1/photos/${editingId}/`, {
      method: "PUT",
      body: JSON.stringify({ title: values.title, alt_text: values.alt_text }),
    })
    setEditingId(null)
    browserRef.current?.refresh()
  } catch {
    // stays open
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Replace renderListRow and renderGalleryItem edit UI**

Remove edit conditionals, add pencil icon with `setEditingId(photo.id)`.

- [ ] **Step 4: Add renderExpandedRow**

```tsx
renderExpandedRow={(photo) =>
  editingId === photo.id ? (
    <TableRow>
      <TableCell colSpan={6} className="p-0">
        <InlineEditPanel
          item={photo}
          fields={photoFields}
          onSave={handleInlineUpdate}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      </TableCell>
    </TableRow>
  ) : null
}
```

- [ ] **Step 5: Verify build and test**

Run: `cd frontend-customer && npx next build`
Test: Edit a photo's title and alt text.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/admin/photos/page.tsx
git commit -m "feat: replace photos inline edit with InlineEditPanel"
```

---

## Chunk 3: Integrate into Live Page (All 4 Tabs)

### Task 8: Integrate InlineEditPanel into Live Classes tab

**Files:**
- Modify: `src/app/admin/live/page.tsx`

The live page has 4 tab components. Each currently uses `showForm` for both create and edit. We need to:
1. Keep `showForm` for create only
2. Remove `openEdit` — replace with `editingId` + InlineEditPanel via `renderExpandedRow`
3. Remove edit-related state that's now handled by the panel

- [ ] **Step 1: Add imports at top of file**

```tsx
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import { TableRow, TableCell } from "@/components/ui/table"
```

- [ ] **Step 2: Refactor LiveClassesTab**

Remove `openEdit` function. Keep `openCreate`. The `handleSave` function now only handles create (remove the `if (editingId)` branch). Add separate `handleInlineUpdate`.

Add field config:
```tsx
const liveClassFields: FieldConfig<LiveClass>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  {
    key: "pricing_type", label: "Access", type: "select",
    options: [{ label: "Free", value: "free" }, { label: "Paid", value: "paid" }],
  },
  { key: "price", label: "Price", type: "number", showWhen: (v) => v.pricing_type === "paid" },
  { key: "auto_recording", label: "Auto Recording", type: "toggle" },
  { key: "scheduled_at", label: "Scheduled At", type: "datetime" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]
```

Add inline update handler:
```tsx
async function handleInlineUpdate(values: Record<string, unknown>) {
  setSaving(true)
  try {
    await clientFetch(`/api/v1/live/${editingId}/`, {
      method: "PUT",
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        pricing_type: values.pricing_type,
        auto_recording: values.auto_recording,
        ...(values.scheduled_at ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() } : {}),
        ...(values.pricing_type === "paid" && values.price ? { price: parseFloat(values.price as string) } : {}),
        ...(values.thumbnail ? { thumbnail: values.thumbnail } : {}),
      }),
    })
    setEditingId(null)
    browserRef.current?.refresh()
  } catch {
    // stays open
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Update renderListRow**

Remove the edit button that called `openEdit`. Add pencil icon that sets `editingId`. Keep Go Live / End buttons as-is.

- [ ] **Step 4: Add renderExpandedRow to MediaBrowser**

```tsx
renderExpandedRow={(lc) =>
  editingId === lc.id ? (
    <TableRow>
      <TableCell colSpan={7} className="p-0">
        <InlineEditPanel
          item={lc}
          fields={liveClassFields}
          onSave={handleInlineUpdate}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      </TableCell>
    </TableRow>
  ) : null
}
```

- [ ] **Step 5: Simplify the create form**

The top Card form panel now only handles create. Remove the edit-related logic (`editingId` check in `handleSave`). `resetForm` no longer needs to clear `editingId`. The form title should always say "New Live Class".

- [ ] **Step 6: Verify build**

Run: `cd frontend-customer && npx next build`

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat: replace live classes edit form with InlineEditPanel"
```

---

### Task 9: Integrate InlineEditPanel into Live Streams tab

**Files:**
- Modify: `src/app/admin/live/page.tsx` (LiveStreamsTab section)

- [ ] **Step 1: Apply same pattern as Task 8**

Field config:
```tsx
const liveStreamFields: FieldConfig<LiveStream>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "pricing_type", label: "Access", type: "select",
    options: [{ label: "Free", value: "free" }, { label: "Paid", value: "paid" }] },
  { key: "price", label: "Price", type: "number", showWhen: (v) => v.pricing_type === "paid" },
  { key: "auto_recording", label: "Auto Recording", type: "toggle" },
  { key: "scheduled_at", label: "Scheduled At", type: "datetime" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]
```

Same refactor: remove `openEdit`, keep `openCreate`, add `handleInlineUpdate` hitting `/api/v1/live-streams/${editingId}/`, add `renderExpandedRow`.

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat: replace live streams edit form with InlineEditPanel"
```

---

### Task 10: Integrate InlineEditPanel into Zoom Classes tab

**Files:**
- Modify: `src/app/admin/live/page.tsx` (ZoomClassesTab section)

- [ ] **Step 1: Apply same pattern**

Field config:
```tsx
const zoomClassFields: FieldConfig<ZoomClass>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "zoom_link", label: "Zoom Link", type: "text" },
  { key: "pricing_type", label: "Access", type: "select",
    options: [{ label: "Free", value: "free" }, { label: "Paid", value: "paid" }] },
  { key: "price", label: "Price", type: "number", showWhen: (v) => v.pricing_type === "paid" },
  { key: "scheduled_at", label: "Scheduled At", type: "datetime" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]
```

API endpoint: `/api/v1/zoom-classes/${editingId}/`

- [ ] **Step 2: Verify build and commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat: replace zoom classes edit form with InlineEditPanel"
```

---

### Task 11: Integrate InlineEditPanel into Onsite Events tab

**Files:**
- Modify: `src/app/admin/live/page.tsx` (OnsiteEventsTab section)

- [ ] **Step 1: Apply same pattern**

Field config:
```tsx
const onsiteEventFields: FieldConfig<OnsiteEvent>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "location", label: "Location", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "max_capacity", label: "Max Capacity", type: "number" },
  { key: "pricing_type", label: "Access", type: "select",
    options: [{ label: "Free", value: "free" }, { label: "Paid", value: "paid" }] },
  { key: "price", label: "Price", type: "number", showWhen: (v) => v.pricing_type === "paid" },
  { key: "scheduled_at", label: "Scheduled At", type: "datetime" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]
```

API endpoint: `/api/v1/onsite-events/${editingId}/`

- [ ] **Step 2: Verify build and commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat: replace onsite events edit form with InlineEditPanel"
```

---

## Chunk 4: Integrate into Courses Page

### Task 12: Add InlineEditPanel to Courses page

**Files:**
- Modify: `src/app/admin/courses/page.tsx`

The courses page currently only has a pencil icon linking to the detail page. We add inline edit for quick field changes while keeping the detail link for full course editing.

- [ ] **Step 1: Add state, imports, and field config**

```tsx
import { InlineEditPanel, type FieldConfig } from "@/components/admin/inline-edit-panel"
import { TableRow, TableCell } from "@/components/ui/table"

const [editingSlug, setEditingSlug] = useState<string | null>(null)
const [saving, setSaving] = useState(false)

const courseFields: FieldConfig<Course>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  {
    key: "pricing_type", label: "Pricing", type: "select",
    options: [
      { label: "Free", value: "free" },
      { label: "Paid", value: "paid" },
    ],
  },
  { key: "price", label: "Price", type: "number", showWhen: (v) => v.pricing_type === "paid" },
  { key: "is_published", label: "Published", type: "toggle" },
  { key: "thumbnail", label: "Thumbnail", type: "image", previewUrlKey: "thumbnail_signed_url" },
]
```

- [ ] **Step 2: Add save handler**

```tsx
async function handleInlineUpdate(values: Record<string, unknown>) {
  setSaving(true)
  try {
    await clientFetch(`/api/v1/courses/${editingSlug}/`, {
      method: "PUT",
      body: JSON.stringify({
        title: values.title,
        pricing_type: values.pricing_type,
        is_published: values.is_published,
        ...(values.pricing_type === "paid" && values.price ? { price: parseFloat(values.price as string) } : {}),
        ...(values.thumbnail ? { thumbnail: values.thumbnail } : {}),
      }),
    })
    setEditingSlug(null)
    browserRef.current?.refresh()
  } catch {
    // stays open
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Update renderListRow**

Change the pencil icon from a Link to a button that sets `editingSlug`. Add a separate link icon (or keep the pencil and add an expand icon) for the detail page. Simplest approach: pencil opens inline edit, add a small "Open" link for the detail page.

```tsx
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
```

- [ ] **Step 4: Add renderExpandedRow**

```tsx
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
```

- [ ] **Step 5: Verify build and test**

Run: `cd frontend-customer && npx next build`
Test: Edit a course title and toggle published status.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/app/admin/courses/page.tsx
git commit -m "feat: add inline edit to courses page"
```

---

## Chunk 5: Final Verification

### Task 13: Full build and manual smoke test

- [ ] **Step 1: Run full build**

Run: `cd frontend-customer && npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Smoke test all pages**

Test each admin page in the browser:
1. `/admin/courses` — pencil opens panel, save works, detail link still works
2. `/admin/videos` — pencil opens panel, title/description/thumbnail editable
3. `/admin/downloads` — pencil opens panel, title/access/price editable
4. `/admin/photos` — pencil opens panel, title/alt_text editable
5. `/admin/live` (Live Classes tab) — pencil opens panel, create form still works separately
6. `/admin/live` (Live Streams tab) — same
7. `/admin/live` (Zoom Classes tab) — same, zoom_link field present
8. `/admin/live` (Onsite Events tab) — same, location/address/capacity fields present
9. Verify only one panel open at a time across all pages
10. Verify Escape closes the panel
11. Verify gallery view has no broken edit UI

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: inline edit panel polish"
```
