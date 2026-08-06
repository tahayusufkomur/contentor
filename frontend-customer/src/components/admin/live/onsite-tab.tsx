"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, MapPin, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
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
  type OnsiteEvent,
  SORT_OPTIONS,
  selectClasses,
  StatusBadge,
  PricingBadge,
  fetchAdminListPage,
  formatDate,
  toLocalDatetimeValue,
  useDeepLinkedItem,
} from "./shared";

// ─── Onsite Events Tab ─────────────────────────────────────────────

const onsiteEventFields: FieldConfig<OnsiteEvent>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "location", label: "Location", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "max_capacity", label: "Max Capacity", type: "number" },
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

export function OnsiteEventsTab() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [pricingType, setPricingType] = useState("free");
  const [price, setPrice] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  // Deep link (?tab=onsite&event=<id>): open one specific event's edit
  // panel directly, independent of MediaBrowser's current page/filters.
  const deepLinked = useDeepLinkedItem<OnsiteEvent>(
    "onsite",
    (id) => `/api/v1/onsite-events/${id}/`,
  );
  const { run: saveDeepLinked, loading: savingDeepLinked } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      if (!deepLinked.item) return;
      await clientFetch(`/api/v1/onsite-events/${deepLinked.item.id}/`, {
        method: "PUT",
        body: JSON.stringify({
          filter_option_ids: values.filter_option_ids ?? [],
          tag_ids: values.tag_ids ?? [],
          title: values.title,
          description: values.description,
          location: values.location,
          address: values.address,
          pricing_type: values.pricing_type,
          ...(values.scheduled_at
            ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() }
            : {}),
          ...(values.max_capacity
            ? { max_capacity: parseInt(values.max_capacity as string) }
            : {}),
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
        }),
      });
      toast.success("Event updated");
      deepLinked.clear();
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update event" },
  );

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<OnsiteEvent>> => {
      return fetchAdminListPage<OnsiteEvent>("/api/v1/onsite-events/", params, {
        tags: tagFilter.join(","),
      });
    },
    [tagFilter],
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setLocation("");
    setAddress("");
    setMaxCapacity("");
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

  const { run: handleSave, loading: creating } = useAsyncAction(
    async () => {
      const body = JSON.stringify({
        filter_option_ids: filterOptionIds,
        tag_ids: tagIds,
        title,
        description,
        location,
        address,
        pricing_type: pricingType,
        ...(scheduledAt
          ? { scheduled_at: new Date(scheduledAt).toISOString() }
          : {}),
        ...(maxCapacity ? { max_capacity: parseInt(maxCapacity) } : {}),
        ...(pricingType !== "free" && price
          ? { price: parseFloat(price) }
          : {}),
      });
      await clientFetch("/api/v1/onsite-events/", { method: "POST", body });
      toast.success("Event created");
      resetForm();
      setShowForm(false);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to create event" },
  );

  const { run: handleInlineUpdate, loading: updating } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/onsite-events/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          filter_option_ids: values.filter_option_ids ?? [],
          tag_ids: values.tag_ids ?? [],
          title: values.title,
          description: values.description,
          location: values.location,
          address: values.address,
          pricing_type: values.pricing_type,
          ...(values.scheduled_at
            ? {
                scheduled_at: new Date(
                  values.scheduled_at as string,
                ).toISOString(),
              }
            : {}),
          ...(values.max_capacity
            ? { max_capacity: parseInt(values.max_capacity as string) }
            : {}),
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
        }),
      });
      toast.success("Event updated");
      setEditingId(null);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update event" },
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Create Event
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New On-site Event</h2>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekend Workshop"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this event about?"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Studio A, Downtown"
              />
            </div>
            <div className="space-y-2">
              <Label>Address (optional)</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full address"
              />
            </div>
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
              <Label>Max Capacity</Label>
              <Input
                type="number"
                min="1"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
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
            <Button
              onClick={handleSave}
              loading={creating}
              loadingText="Creating…"
              disabled={!title.trim()}
            >
              Create
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

      {deepLinked.item && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Editing: {deepLinked.item.title}
            </h2>
          </div>
          <InlineEditPanel
            item={{
              ...deepLinked.item,
              scheduled_at: toLocalDatetimeValue(deepLinked.item.scheduled_at),
              filter_option_ids: (deepLinked.item.filter_options ?? []).map(
                (o) => o.id,
              ),
              tag_ids: (deepLinked.item.tags ?? []).map((t) => t.id),
            }}
            fields={onsiteEventFields}
            onSave={saveDeepLinked}
            onCancel={deepLinked.clear}
            saving={savingDeepLinked}
          />
        </div>
      )}
      {deepLinked.requestedId && !deepLinked.item && !deepLinked.loading && (
        <p className="text-sm text-muted-foreground">
          That event couldn&apos;t be found — it may have been deleted.
        </p>
      )}

      <MediaBrowser<OnsiteEvent>
        ref={browserRef}
        persistKey="onsite-events"
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
        emptyIcon={MapPin}
        emptyMessage="No on-site events yet. Create one to get started."
        getItemId={(ev) => ev.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/onsite-events/${id}/`, {
                  method: "DELETE",
                }).catch(() => {}),
            ),
          );
          toast.success("Events deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Status", key: "status" },
          { label: "Title", key: "title" },
          { label: "Date", key: "date" },
          { label: "Location", key: "location" },
          { label: "Pricing", key: "pricing" },
          { label: "Actions", key: "actions" },
        ]}
        renderListRow={(ev) => (
          <>
            <TableCell>
              <StatusBadge status={ev.status} />
            </TableCell>
            <TableCell>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {ev.title}
                  <DemoBadge type="onsite_events" id={ev.id} />
                </div>
                {ev.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {ev.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(ev.scheduled_at)}
              </span>
            </TableCell>
            <TableCell>
              {ev.location ? (
                <div className="flex items-center gap-1 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{ev.location}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <PricingBadge pricingType={ev.pricing_type} price={ev.price} />
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingId(ev.id)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </TableCell>
          </>
        )}
        renderExpandedRow={(ev) =>
          editingId === ev.id ? (
            <TableRow>
              <TableCell colSpan={7} className="p-0">
                <InlineEditPanel
                  item={
                    {
                      ...ev,
                      scheduled_at: toLocalDatetimeValue(ev.scheduled_at),
                      max_capacity: ev.max_capacity
                        ? String(ev.max_capacity)
                        : "",
                      filter_option_ids: (ev.filter_options ?? []).map(
                        (o) => o.id,
                      ),
                      tag_ids: (ev.tags ?? []).map((t) => t.id),
                    } as unknown as OnsiteEvent
                  }
                  fields={onsiteEventFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingId(null)}
                  saving={updating}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  );
}
