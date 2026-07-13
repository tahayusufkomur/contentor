"use client";

// Shared admin-kit (schema-driven admin renderer).
// Gallery mode's create/edit surface: an image preview + ONE JSON textarea
// for all editable fields — a bulk-curation workflow, not a field form.

import { useState } from "react";
import { Loader2 } from "lucide-react";

import type { FieldSchema, ImageValue, ModelMeta, Row, RowValue } from "./types";

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
  return value &&
    typeof value === "object" &&
    "key" in value &&
    "url" in value
    ? (value as ImageValue)
    : null;
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
}: {
  meta: ModelMeta;
  target: GalleryTarget;
  rows: Row[];
  busy: boolean;
  serverError: string;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => initialJson(meta, target, rows));
  const [parseError, setParseError] = useState("");
  const image =
    target.mode === "create"
      ? target.image
      : imageOf(target.row[meta.gallery_image_field ?? ""]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">
          {target.mode === "create" ? `New ${meta.label}` : `Edit ${meta.label}`}
        </h2>
        {image && (
          <div className="flex items-center justify-center rounded-md border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.key.split("/").pop() || image.key}
              className="max-h-32 object-contain"
            />
          </div>
        )}
        <KitTextarea
          aria-label="Record JSON"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={10}
          className="font-mono text-xs"
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
