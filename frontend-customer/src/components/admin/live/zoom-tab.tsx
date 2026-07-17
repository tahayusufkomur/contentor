"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";
import {
  InlineEditPanel,
  type FieldConfig,
} from "@/components/admin/inline-edit-panel";
import { FilterPicker } from "@/components/admin/filter-picker";
import { TagInput } from "@/components/admin/tag-input";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { DemoBadge } from "@/components/setup/demo-badge";
import {
  type ZoomClass,
  SORT_OPTIONS,
  selectClasses,
  StatusBadge,
  PricingBadge,
  fetchAdminListPage,
  formatDate,
  toLocalDatetimeValue,
} from "./shared";

// ─── Zoom Classes Tab ──────────────────────────────────────────────

const zoomClassFields: FieldConfig<ZoomClass>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "zoom_link", label: "Zoom Link", type: "text" },
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
  { key: "scheduled_at", label: "Scheduled Date", type: "datetime" },
  {
    key: "filter_option_ids",
    label: "Filters",
    type: "filterOptions",
    filterScope: "event",
  },
  { key: "tag_ids", label: "Tags", type: "tags", tagScope: "event" },
];

export function ZoomClassesTab() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [zoomLink, setZoomLink] = useState("");
  const [pricingType, setPricingType] = useState("free");
  const [price, setPrice] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<ZoomClass>> => {
      return fetchAdminListPage<ZoomClass>("/api/v1/zoom-classes/", params, {
        tags: tagFilter.join(","),
      });
    },
    [tagFilter],
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setZoomLink("");
    setPricingType("free");
    setPrice("");
    setScheduledAt("");
    setFilterOptionIds([]);
    setTagIds([]);
  }
  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = JSON.stringify({
        filter_option_ids: filterOptionIds,
        tag_ids: tagIds,
        title,
        description,
        zoom_link: zoomLink,
        pricing_type: pricingType,
        ...(scheduledAt
          ? { scheduled_at: new Date(scheduledAt).toISOString() }
          : {}),
        ...(pricingType !== "free" && price
          ? { price: parseFloat(price) }
          : {}),
      });
      await clientFetch("/api/v1/zoom-classes/", { method: "POST", body });
      toast.success("Zoom class created");
      resetForm();
      setShowForm(false);
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to create Zoom class");
    } finally {
      setSaving(false);
    }
  }

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true);
    try {
      await clientFetch(`/api/v1/zoom-classes/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          filter_option_ids: values.filter_option_ids ?? [],
          tag_ids: values.tag_ids ?? [],
          title: values.title,
          description: values.description,
          zoom_link: values.zoom_link,
          pricing_type: values.pricing_type,
          ...(values.scheduled_at
            ? {
                scheduled_at: new Date(
                  values.scheduled_at as string,
                ).toISOString(),
              }
            : {}),
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
        }),
      });
      toast.success("Zoom class updated");
      setEditingId(null);
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to update Zoom class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Create Zoom Class
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Zoom Class</h2>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Group Coaching Session"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you cover?"
            />
          </div>
          <div className="space-y-2">
            <Label>Zoom Link</Label>
            <Input
              value={zoomLink}
              onChange={(e) => setZoomLink(e.target.value)}
              placeholder="https://zoom.us/j/..."
            />
          </div>
          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <div className="space-y-2">
              <Label>Access</Label>
              <select
                value={pricingType}
                onChange={(e) => setPricingType(e.target.value)}
                className={selectClasses}
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {pricingType !== "free" && (
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Filters</Label>
            <FilterPicker
              scope="event"
              value={filterOptionIds}
              onChange={setFilterOptionIds}
            />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput scope="event" value={tagIds} onChange={setTagIds} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? "Saving..." : "Create"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <MediaBrowser<ZoomClass>
        ref={browserRef}
        persistKey="zoom-classes"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="event"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        galleryEnabled={false}
        emptyIcon={ExternalLink}
        emptyMessage="No Zoom classes yet. Create one to get started."
        getItemId={(zc) => zc.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/zoom-classes/${id}/`, {
                  method: "DELETE",
                }).catch(() => {}),
            ),
          );
          toast.success("Zoom classes deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Status", key: "status" },
          { label: "Title", key: "title" },
          { label: "Date", key: "date" },
          { label: "Pricing", key: "pricing" },
          { label: "Actions", key: "actions" },
        ]}
        renderListRow={(zc) => (
          <>
            <TableCell>
              <StatusBadge status={zc.status} />
            </TableCell>
            <TableCell>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {zc.title}
                  <DemoBadge type="zoom_classes" id={zc.id} />
                </div>
                {zc.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {zc.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(zc.scheduled_at)}
              </span>
            </TableCell>
            <TableCell>
              <PricingBadge pricingType={zc.pricing_type} price={zc.price} />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(zc.id)}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {zc.zoom_link && (
                  <a
                    href={zc.zoom_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Zoom
                  </a>
                )}
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(zc) =>
          editingId === zc.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={{
                    ...zc,
                    scheduled_at: toLocalDatetimeValue(zc.scheduled_at),
                    filter_option_ids: (zc.filter_options ?? []).map(
                      (o) => o.id,
                    ),
                    tag_ids: (zc.tags ?? []).map((t) => t.id),
                  }}
                  fields={zoomClassFields}
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
  );
}
