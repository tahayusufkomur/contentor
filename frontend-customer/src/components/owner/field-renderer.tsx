"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { clientFetch } from "@/lib/api-client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { VideoPicker } from "@/components/admin/video-picker";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Pencil,
  Link2,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  Columns2,
  LayoutGrid,
  LayoutDashboard,
  LayoutTemplate,
  List,
  Quote,
  Rows3,
  Square,
  RectangleHorizontal,
  GalleryHorizontal,
  Minus,
  PanelTop,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRichEditor } from "@/components/owner/rich-editor";
import { LinkPickerModal } from "@/components/owner/link-picker";
import { RichHtml } from "@/components/blocks/rich-html";
import type { FieldSchema } from "@/lib/blocks/field-schema";
import type { Photo } from "@/types/photo";
import type { FilterGroup } from "@/types/course";

// Icon for each known layout value, used by the icon-tile layout picker. The
// label always accompanies the icon, so an approximate glyph is fine; unknown
// values fall back to a generic layout icon.
const LAYOUT_ICONS: Record<string, LucideIcon> = {
  centered: AlignCenter,
  split: Columns2,
  columns: Columns2,
  standard: AlignLeft,
  plain: AlignLeft,
  open: AlignLeft,
  minimal: Minus,
  wide: RectangleHorizontal,
  full: RectangleHorizontal,
  band: RectangleHorizontal,
  grid: LayoutGrid,
  cards: LayoutGrid,
  card: Square,
  soft: Square,
  masonry: LayoutDashboard,
  list: List,
  accordion: Rows3,
  stacked: Rows3,
  row: Rows3,
  compact: AlignJustify,
  carousel: GalleryHorizontal,
  quote: Quote,
  bar: PanelTop,
  banner: Flag,
};

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
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? ""}
          />
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
      );

    case "link":
      return <LinkField field={field} value={value} onChange={onChange} />;

    case "number":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <Input
            type="number"
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? "" : Number(e.target.value))
            }
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
      if (field.display === "icons") {
        return (
          <IconSelectField field={field} value={value} onChange={onChange} />
        );
      }
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <select
            className={selectClass}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
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
            onSelect={(photo: Photo) =>
              onChange({ url: photo.signed_url, photo_id: photo.id })
            }
            onClear={() => onChange({ url: null, photo_id: null })}
            label="Choose image"
          />
        </div>
      );

    case "video":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <VideoPicker
            allowUrl
            value={value?.video_id ?? null}
            previewUrl={value?.url ?? null}
            onChange={(videoId, signedUrl) =>
              onChange({ url: signedUrl, video_id: videoId })
            }
          />
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
      );

    case "richtext":
      return <RichTextField field={field} value={value} onChange={onChange} />;

    case "repeater":
      return <RepeaterField field={field} value={value} onChange={onChange} />;

    case "filterGroups":
      return <FilterGroupsField field={field} value={value} onChange={onChange} />;

    default:
      return null;
  }
}

/** A `select` rendered as a grid of icon tiles (used for the per-block Layout
 *  picker). Each tile shows the layout's icon above its label and highlights
 *  the current selection — clearer at a glance than a dropdown. */
function IconSelectField({ field, value, onChange }: FieldRendererProps) {
  return (
    <div className="space-y-1">
      <FieldLabel field={field} />
      <div className="grid grid-cols-3 gap-1.5">
        {field.options?.map((opt) => {
          const Icon = LAYOUT_ICONS[opt.value] ?? LayoutTemplate;
          const active = (value ?? "") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.label}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center text-[11px] leading-tight transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="line-clamp-2">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}

function RichTextField({ field, value, onChange }: FieldRendererProps) {
  const richEditor = useRichEditor();

  // Fallback to a plain textarea if the rich-editor provider isn't mounted.
  if (!richEditor) {
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
  }

  return (
    <div className="space-y-1">
      <FieldLabel field={field} />
      <div className="rounded-md border bg-background p-2">
        {value ? (
          <RichHtml
            html={value}
            className="max-h-24 overflow-hidden text-sm text-muted-foreground"
          />
        ) : (
          <p className="text-sm text-muted-foreground/60">No text yet.</p>
        )}
        <button
          type="button"
          onClick={() =>
            richEditor.openRichEditor({
              value: value ?? "",
              title: field.label,
              onSave: onChange,
            })
          }
          className="mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit text
        </button>
      </div>
    </div>
  );
}

function LinkField({ field, value, onChange }: FieldRendererProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="space-y-1">
      <FieldLabel field={field} />
      <div className="flex gap-1.5">
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "/path or https://…"}
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          title="Choose a page or content"
          className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
        >
          <Link2 className="h-3.5 w-3.5" /> Browse
        </button>
      </div>
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
      {pickerOpen && (
        <LinkPickerModal
          initialValue={value ?? ""}
          onPick={(href) => {
            onChange(href);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** Lets the coach choose which of their Filters a dynamic block exposes as
 *  public facets. Value is an array of FilterGroup ids; the block then shows a
 *  facet per chosen filter. */
function FilterGroupsField({ field, value, onChange }: FieldRendererProps) {
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const selected: number[] = Array.isArray(value) ? value : [];
  const scope = field.filterScope ?? "course";

  const load = useCallback(async () => {
    try {
      const data = await clientFetch<FilterGroup[]>(
        `/api/v1/filters/groups/?applies_to=${scope}`,
      );
      setGroups(data);
    } catch {
      // ignore
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1">
      <FieldLabel field={field} />
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No filters yet. Create filters in the studio admin to show them here.
        </p>
      ) : (
        <div className="space-y-1">
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.includes(g.id)}
                onChange={() => toggle(g.id)}
                className="accent-primary"
              />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
      )}
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
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
        <Plus className="h-3.5 w-3.5" /> Add{" "}
        {field.itemLabel?.toLowerCase() ?? "item"}
      </button>
    </div>
  );
}
