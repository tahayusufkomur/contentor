"use client";

// Shared admin-kit (schema-driven admin renderer).
// Gallery mode's create/edit surface: a fullscreen image pane + a metadata
// sidebar with ONE JSON textarea for all editable fields — a bulk-curation
// workflow, not a field form.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, X } from "lucide-react";

import type {
  FieldSchema,
  ImageValue,
  ModelMeta,
  Row,
  RowValue,
} from "./types";

import { KitButton, KitTextarea } from "./primitives";

export type GalleryTarget =
  | { mode: "create"; image: ImageValue }
  | { mode: "edit"; row: Row };

function editableFields(meta: ModelMeta): FieldSchema[] {
  return meta.form_fields.filter(
    (f) =>
      !f.read_only &&
      f.type !== "image" &&
      f.name !== (meta.gallery_image_field ?? ""),
  );
}

function defaultFor(field: FieldSchema): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "boolean":
      return false;
    case "integer":
    case "decimal":
      return 0;
    default:
      return "";
  }
}

function titleFromFilename(key: string): string {
  const base = key.split("/").pop() ?? "";
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The prefilled JSON the superadmin edits. Create mode seeds title from the
 * uploaded filename, position past the largest on this page, enabled=true. */
export function initialJson(
  meta: ModelMeta,
  target: GalleryTarget,
  rows: Row[],
): string {
  const record: Record<string, unknown> = {};
  for (const field of editableFields(meta)) {
    record[field.name] =
      target.mode === "edit"
        ? (target.row[field.name] ?? defaultFor(field))
        : defaultFor(field);
  }
  if (target.mode === "create") {
    if ("title" in record) record.title = titleFromFilename(target.image.key);
    if ("position" in record) {
      const max = Math.max(0, ...rows.map((r) => Number(r.position ?? 0)));
      record.position = max + 1;
    }
    if ("enabled" in record) record.enabled = true;
  }
  return JSON.stringify(record, null, 2);
}

/** Parse + validate the textarea: must be a JSON object whose keys are all
 * editable fields. Returns {data} or {error} — never throws. */
export function parseRecord(
  meta: ModelMeta,
  text: string,
): { data?: Record<string, unknown>; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Expected a JSON object." };
  }
  const allowed = new Set(editableFields(meta).map((f) => f.name));
  const unknown = Object.keys(parsed).filter((k) => !allowed.has(k));
  if (unknown.length) {
    return { error: `Unknown field(s): ${unknown.join(", ")}` };
  }
  return { data: parsed as Record<string, unknown> };
}

function imageOf(value: RowValue | undefined): ImageValue | null {
  return value && typeof value === "object" && "key" in value && "url" in value
    ? (value as ImageValue)
    : null;
}

/** Sibling row in `rows` one step before/after `row`, by matching pk — null
 * at either end of the currently loaded page (no cross-page wrap/fetch). */
function siblingRow(
  meta: ModelMeta,
  rows: Row[],
  row: Row,
  direction: -1 | 1,
): Row | null {
  const index = rows.findIndex(
    (r) => String(r[meta.pk_field]) === String(row[meta.pk_field]),
  );
  if (index === -1) return null;
  return rows[index + direction] ?? null;
}

export function JsonRecordModal({
  meta,
  target,
  rows,
  busy,
  serverError,
  onSave,
  onDelete,
  onClose,
  onNavigate,
}: {
  meta: ModelMeta;
  target: GalleryTarget;
  rows: Row[];
  busy: boolean;
  serverError: string;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Switch the modal to another row without closing it (prev/next). */
  onNavigate?: (row: Row) => void;
}) {
  const [text, setText] = useState(() => initialJson(meta, target, rows));
  const [parseError, setParseError] = useState("");
  const image =
    target.mode === "create"
      ? target.image
      : imageOf(target.row[meta.gallery_image_field ?? ""]);

  const prevRow =
    target.mode === "edit" ? siblingRow(meta, rows, target.row, -1) : null;
  const nextRow =
    target.mode === "edit" ? siblingRow(meta, rows, target.row, 1) : null;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "TEXTAREA" || activeTag === "INPUT") return;
      if (e.key === "ArrowLeft" && prevRow) onNavigate?.(prevRow);
      if (e.key === "ArrowRight" && nextRow) onNavigate?.(nextRow);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNavigate, prevRow, nextRow]);

  const save = () => {
    const { data, error } = parseRecord(meta, text);
    if (error) {
      setParseError(error);
      return;
    }
    setParseError("");
    onSave(data!);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background sm:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-white p-6 sm:p-10">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.key.split("/").pop() || image.key}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
        )}
        {prevRow && (
          <button
            type="button"
            aria-label="Previous item"
            onClick={() => onNavigate?.(prevRow)}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {nextRow && (
          <button
            type="button"
            aria-label="Next item"
            onClick={() => onNavigate?.(nextRow)}
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t bg-card p-5 sm:h-full sm:w-96 sm:border-l sm:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {target.mode === "create"
              ? `New ${meta.label}`
              : `Edit ${meta.label}`}
          </h2>
          <KitButton
            variant="ghost"
            aria-label="Close"
            onClick={onClose}
            className="h-8 w-8 shrink-0 px-0"
          >
            <X className="h-4 w-4" />
          </KitButton>
        </div>
        <KitTextarea
          aria-label="Record JSON"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none font-mono text-xs"
        />
        {(parseError || serverError) && (
          <p className="text-xs text-destructive">
            {parseError || serverError}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {target.mode === "edit" ? (
            <KitButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete this ${meta.label.toLowerCase()}?`))
                  onDelete();
              }}
            >
              Delete
            </KitButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <KitButton onClick={onClose} disabled={busy}>
              Cancel
            </KitButton>
            <KitButton variant="primary" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </KitButton>
          </div>
        </div>
      </div>
    </div>
  );
}
