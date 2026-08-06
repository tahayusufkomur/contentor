"use client";

import { useCallback, useRef, useState } from "react";
import { Plus, Play, Square, Radio, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
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
  type LiveStream,
  SORT_OPTIONS,
  selectClasses,
  StatusBadge,
  PricingBadge,
  fetchAdminListPage,
  formatDate,
  toLocalDatetimeValue,
  useDeepLinkedItem,
} from "./shared";

// ─── Live Streams Tab ──────────────────────────────────────────────

const liveStreamFields: FieldConfig<LiveStream>[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
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

export function LiveStreamsTab() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pricingType, setPricingType] = useState("free");
  const [price, setPrice] = useState("");
  const [autoRecording, setAutoRecording] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  // Deep link (?tab=streams&event=<id>): open one specific stream's edit
  // panel directly, independent of MediaBrowser's current page/filters.
  const deepLinked = useDeepLinkedItem<LiveStream>(
    "streams",
    (id) => `/api/v1/live-streams/${id}/`,
  );
  const { run: saveDeepLinked, loading: savingDeepLinked } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      if (!deepLinked.item) return;
      await clientFetch(`/api/v1/live-streams/${deepLinked.item.id}/`, {
        method: "PUT",
        body: JSON.stringify({
          filter_option_ids: values.filter_option_ids ?? [],
          tag_ids: values.tag_ids ?? [],
          title: values.title,
          description: values.description,
          pricing_type: values.pricing_type,
          ...(values.scheduled_at
            ? { scheduled_at: new Date(values.scheduled_at as string).toISOString() }
            : {}),
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
        }),
      });
      toast.success("Live stream updated");
      deepLinked.clear();
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update live stream" },
  );

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<LiveStream>> => {
      return fetchAdminListPage<LiveStream>("/api/v1/live-streams/", params, {
        tags: tagFilter.join(","),
      });
    },
    [tagFilter],
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setPricingType("free");
    setPrice("");
    setAutoRecording(false);
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
        pricing_type: pricingType,
        auto_recording: autoRecording,
        ...(scheduledAt
          ? { scheduled_at: new Date(scheduledAt).toISOString() }
          : {}),
        ...(pricingType !== "free" && price
          ? { price: parseFloat(price) }
          : {}),
      });
      await clientFetch("/api/v1/live-streams/", { method: "POST", body });
      toast.success("Live stream created");
      resetForm();
      setShowForm(false);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to create live stream" },
  );

  const { run: handleInlineUpdate, loading: updating } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/live-streams/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          filter_option_ids: values.filter_option_ids ?? [],
          tag_ids: values.tag_ids ?? [],
          title: values.title,
          description: values.description,
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
      toast.success("Live stream updated");
      setEditingId(null);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update live stream" },
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Create Stream
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Live Stream</h2>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Q&A Stream"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you stream about?"
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
            <Label>Scheduled Date</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRecording}
              onChange={(e) => setAutoRecording(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Auto-record this stream</span>
          </label>
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
            fields={liveStreamFields}
            onSave={saveDeepLinked}
            onCancel={deepLinked.clear}
            saving={savingDeepLinked}
          />
        </div>
      )}
      {deepLinked.requestedId && !deepLinked.item && !deepLinked.loading && (
        <p className="text-sm text-muted-foreground">
          That live stream couldn&apos;t be found — it may have been deleted.
        </p>
      )}

      <MediaBrowser<LiveStream>
        ref={browserRef}
        persistKey="live-streams"
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
        emptyIcon={Radio}
        emptyMessage="No live streams yet. Create one to get started."
        getItemId={(ls) => ls.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/live-streams/${id}/`, {
                  method: "DELETE",
                }).catch(() => {}),
            ),
          );
          toast.success("Live streams deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Status", key: "status" },
          { label: "Title", key: "title" },
          { label: "Date", key: "date" },
          { label: "Pricing", key: "pricing" },
          { label: "Actions", key: "actions" },
        ]}
        renderListRow={(ls) => (
          <>
            <TableCell>
              <StatusBadge status={ls.status} />
            </TableCell>
            <TableCell>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {ls.title}
                  <DemoBadge type="live_streams" id={ls.id} />
                </div>
                {ls.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {ls.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(ls.scheduled_at)}
              </span>
            </TableCell>
            <TableCell>
              <PricingBadge pricingType={ls.pricing_type} price={ls.price} />
            </TableCell>
            <TableCell>
              <LiveStreamRowActions
                liveStream={ls}
                onEdit={() => setEditingId(ls.id)}
                onStopped={() => browserRef.current?.refresh()}
              />
            </TableCell>
          </>
        )}
        renderExpandedRow={(ls) =>
          editingId === ls.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={{
                    ...ls,
                    scheduled_at: toLocalDatetimeValue(ls.scheduled_at),
                    filter_option_ids: (ls.filter_options ?? []).map(
                      (o) => o.id,
                    ),
                    tag_ids: (ls.tags ?? []).map((t) => t.id),
                  }}
                  fields={liveStreamFields}
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

// ─── Per-row Start/Stop actions (own useAsyncAction instances so rows
// don't share a loading flag — see the per-row gotcha in the retrofit brief) ───

function LiveStreamRowActions({
  liveStream: ls,
  onEdit,
  onStopped,
}: {
  liveStream: LiveStream;
  onEdit: () => void;
  onStopped: () => void;
}) {
  const navigate = useNavigate();

  const { run: handleStart, loading: starting } = useAsyncAction(
    async () => {
      await clientFetch(`/api/v1/live-streams/${ls.id}/start/`, {
        method: "POST",
      });
      navigate(`/live-stream/${ls.id}`);
    },
    { errorToast: "Failed to start live stream" },
  );

  const { run: handleStop, loading: stopping } = useAsyncAction(
    async () => {
      await clientFetch(`/api/v1/live-streams/${ls.id}/stop/`, {
        method: "POST",
      });
      toast.success("Live stream stopped");
      onStopped();
    },
    { errorToast: "Failed to stop live stream" },
  );

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      {(ls.status === "draft" || ls.status === "scheduled") && (
        <Button
          size="sm"
          onClick={handleStart}
          loading={starting}
          loadingText="Starting…"
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" /> Go Live
        </Button>
      )}
      {ls.status === "live" && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/live-stream/${ls.id}`)}
          >
            Watch
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            loading={stopping}
            loadingText="Ending…"
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5" /> End
          </Button>
        </>
      )}
    </div>
  );
}
