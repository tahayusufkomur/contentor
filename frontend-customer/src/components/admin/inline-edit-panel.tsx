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
import { VideoPicker } from "@/components/admin/video-picker"
import { FilterPicker } from "@/components/admin/filter-picker"
import { Loader2 } from "lucide-react"
import type { Photo } from "@/types/photo"

// --- Types ---

export interface FieldConfig<T> {
  key: keyof T & string
  label: string
  type: "text" | "number" | "select" | "toggle" | "datetime" | "textarea" | "image" | "video" | "filterOptions"
  options?: { label: string; value: string }[]
  showWhen?: (values: Record<string, unknown>) => boolean
  placeholder?: string
  required?: boolean
  /** For image fields: the key on the item that holds the preview URL */
  previewUrlKey?: keyof T & string
  /** For filterOptions fields: which filters to offer. */
  filterScope?: "course" | "event"
}

export interface InlineEditPanelProps<T> {
  item: T
  fields: FieldConfig<T>[]
  onSave: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

// --- Component ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function InlineEditPanel<T extends Record<string, any>>({
  item,
  fields,
  onSave,
  onCancel,
  saving = false,
}: InlineEditPanelProps<T>) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) {
      init[f.key] =
        item[f.key] ??
        (f.type === "toggle" ? false : f.type === "filterOptions" ? [] : "")
    }
    return init
  })

  const [imagePreviewUrls, setImagePreviewUrls] = useState<
    Record<string, string | null>
  >(() => {
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
      (values[f.key] === "" ||
        values[f.key] === null ||
        values[f.key] === undefined)
  )

  const visibleFields = fields.filter(
    (f) => !f.showWhen || f.showWhen(values)
  )

  return (
    <div className="border-t bg-muted/30 px-4 py-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleFields.map((field) => (
          <div
            key={field.key}
            className={
              field.type === "textarea" ||
              field.type === "image" ||
              field.type === "video" ||
              field.type === "filterOptions"
                ? "sm:col-span-2 lg:col-span-3"
                : ""
            }
          >
            <Label
              htmlFor={`edit-${field.key}`}
              className="mb-1.5 block text-sm font-medium"
            >
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
                onSelect={(photo: Photo) => {
                  setValue(field.key, photo.id)
                  setImagePreviewUrls((prev) => ({
                    ...prev,
                    [field.key]: photo.signed_url,
                  }))
                }}
                onClear={() => {
                  setValue(field.key, null)
                  setImagePreviewUrls((prev) => ({
                    ...prev,
                    [field.key]: null,
                  }))
                }}
              />
            )}

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

            {field.type === "filterOptions" && (
              <FilterPicker
                scope={field.filterScope ?? "event"}
                value={(values[field.key] as number[]) ?? []}
                onChange={(ids) => setValue(field.key, ids)}
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
