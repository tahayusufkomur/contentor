"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { FieldSchema } from "@/lib/blocks/field-schema";
import type { Photo } from "@/types/photo";

const textareaClass =
  "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

interface FieldRendererProps {
  field: FieldSchema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (value: any) => void;
}

function FieldLabel({ field }: { field: FieldSchema }) {
  return (
    <Label className="text-xs">
      {field.label}
      {field.required && <span className="text-destructive"> *</span>}
    </Label>
  );
}

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  switch (field.type) {
    case "text":
    case "link":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? (field.type === "link" ? "/path or https://…" : "")}
          />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <Input
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={field.placeholder}
          />
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <textarea
            className={textareaClass}
            rows={4}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <select className={selectClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case "toggle":
      return (
        <div className="flex items-center justify-between">
          <FieldLabel field={field} />
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );

    case "image":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <PhotoPicker
            value={value?.photo_id ?? null}
            previewUrl={value?.url ?? null}
            onSelect={(photo: Photo) => onChange({ url: photo.signed_url, photo_id: photo.id })}
            onClear={() => onChange({ url: null, photo_id: null })}
            label="Choose image"
          />
        </div>
      );

    case "video":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <Input
            value={value?.url ?? ""}
            onChange={(e) => onChange({ url: e.target.value || null, video_id: null })}
            placeholder="YouTube / Vimeo URL"
          />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case "repeater":
      return <RepeaterField field={field} value={value} onChange={onChange} />;

    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyItem(itemFields: FieldSchema[]): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item: Record<string, any> = {};
  for (const f of itemFields) {
    if (f.type === "image") item[f.key] = { url: null, photo_id: null };
    else if (f.type === "video") item[f.key] = { url: null, video_id: null };
    else if (f.type === "toggle") item[f.key] = false;
    else item[f.key] = "";
  }
  return item;
}

function RepeaterField({ field, value, onChange }: FieldRendererProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: Record<string, any>[] = Array.isArray(value) ? value : [];
  const itemFields = field.itemFields ?? [];
  const atMax = field.maxItems !== undefined && items.length >= field.maxItems;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (i: number, patch: Record<string, any>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    if (atMax) return;
    onChange([...items, emptyItem(itemFields)]);
  };

  return (
    <div className="space-y-2">
      <FieldLabel field={field} />
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded border bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {field.itemLabel ?? "Item"} {i + 1}
            </span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="rounded p-1 hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                className="rounded p-1 hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded p-1 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {itemFields.map((sub) => (
            <FieldRenderer
              key={sub.key}
              field={sub}
              value={item[sub.key]}
              onChange={(v) => update(i, { [sub.key]: v })}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={atMax}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> Add {field.itemLabel?.toLowerCase() ?? "item"}
      </button>
    </div>
  );
}
