"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Square, Radio, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";

interface LiveStream {
  id: number;
  title: string;
  description: string;
  status: string;
  pricing_type: string;
  price: string;
  room_name: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  results: T[];
  next: string | null;
  count: number;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    color: "bg-muted text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Clock className="h-3 w-3" />,
  },
  live: {
    label: "Live",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <Radio className="h-3 w-3 animate-pulse" />,
  },
  ended: {
    label: "Ended",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
];

export default function LiveStreamsPage() {
  const router = useRouter();
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pricingType, setPricingType] = useState("free");
  const [price, setPrice] = useState("");
  const [autoRecording, setAutoRecording] = useState(false);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<LiveStream>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      const data = await clientFetch<
        PaginatedResponse<LiveStream> | LiveStream[]
      >(`/api/v1/live-streams/?${sp.toString()}`);
      if (Array.isArray(data)) {
        return { results: data, next: null, count: data.length };
      }
      return { results: data.results, next: data.next, count: data.count };
    },
    [],
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setPricingType("free");
    setPrice("");
    setAutoRecording(false);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      await clientFetch<LiveStream>("/api/v1/live-streams/", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          pricing_type: pricingType,
          auto_recording: autoRecording,
          ...(pricingType !== "free" && price
            ? { price: parseFloat(price) }
            : {}),
        }),
      });
      resetForm();
      setShowCreate(false);
      browserRef.current?.refresh();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function handleStart(id: number) {
    try {
      await clientFetch(`/api/v1/live-streams/${id}/start/`, {
        method: "POST",
      });
      router.push(`/live-stream/${id}`);
    } catch {
      // ignore
    }
  }

  async function handleStop(id: number) {
    try {
      await clientFetch(`/api/v1/live-streams/${id}/stop/`, {
        method: "POST",
      });
      browserRef.current?.refresh();
    } catch {
      // ignore
    }
  }

  const selectClasses =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Streams</h1>
          <p className="text-sm text-muted-foreground">
            Broadcast to your audience with live chat.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Stream
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Live Stream</h2>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Q&A Stream"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you stream about?"
            />
          </div>

          <div className="flex gap-4">
            <div className="space-y-2">
              <Label htmlFor="pricing">Access</Label>
              <select
                id="pricing"
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
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRecording}
              onChange={(e) => setAutoRecording(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Auto-record this stream</span>
          </label>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!title.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <MediaBrowser<LiveStream>
        ref={browserRef}
        persistKey="live-streams"
        fetchPage={fetchPage}
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
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Status", key: "status" },
          { label: "Title", key: "title" },
          { label: "Pricing", key: "pricing" },
          { label: "Actions", key: "actions" },
        ]}
        renderListRow={(ls) => {
          const cfg = statusConfig[ls.status] || statusConfig.draft;
          return (
            <>
              <TableCell>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}
                >
                  {cfg.icon} {cfg.label}
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className="font-medium truncate">{ls.title}</p>
                  {ls.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {ls.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {ls.pricing_type === "free" ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Free
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    ${parseFloat(ls.price).toFixed(0)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {(ls.status === "draft" || ls.status === "scheduled") && (
                    <Button
                      size="sm"
                      onClick={() => handleStart(ls.id)}
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
                        onClick={() => router.push(`/live-stream/${ls.id}`)}
                      >
                        Watch
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleStop(ls.id)}
                        className="gap-1.5"
                      >
                        <Square className="h-3.5 w-3.5" /> End
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </>
          );
        }}
      />
    </div>
  );
}
