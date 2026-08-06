import { useEffect, useState } from "react";
import { Clock, Radio, CheckCircle2 } from "lucide-react";
import { clientFetch } from "@/lib/api-client";
import type {
  FetchPageParams,
  FetchPageResult,
} from "@/components/admin/media-browser";
import type { FilterOption, Tag } from "@/types/course";

// ─── Shared types & config ─────────────────────────────────────────

export interface LiveItem {
  id: number;
  title: string;
  description: string;
  status: string;
  pricing_type: string;
  price: string;
  created_at: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  filter_options?: FilterOption[];
  filter_option_ids?: number[];
  tags?: Tag[];
  tag_ids?: number[];
}

export interface LiveClass extends LiveItem {
  room_name: string;
}

export interface LiveStream extends LiveItem {
  room_name: string;
}

export interface ZoomClass extends LiveItem {
  zoom_link: string;
  zoom_meeting_id: string;
}

export interface OnsiteEvent extends LiveItem {
  location: string;
  address: string;
  max_capacity: number | null;
}

export const statusConfig: Record<
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
  ongoing: {
    label: "Ongoing",
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

export const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
];

export const selectClasses =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}
    >
      {cfg.icon} {cfg.label}
    </div>
  );
}

export function PricingBadge({
  pricingType,
  price,
}: {
  pricingType: string;
  price: string;
}) {
  if (pricingType === "free") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Free
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      ${parseFloat(price).toFixed(0)}
    </span>
  );
}

export interface PaginatedResponse<T> {
  results: T[];
  next: string | null;
  count: number;
}

export async function fetchAdminListPage<T>(
  path: string,
  params: FetchPageParams,
  extra?: Record<string, string>,
): Promise<FetchPageResult<T>> {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit));
  sp.set("offset", String(params.offset));
  sp.set("ordering", params.ordering);
  if (params.search) sp.set("search", params.search);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) sp.set(k, v);

  const data = await clientFetch<PaginatedResponse<T> | T[]>(
    `${path}?${sp.toString()}`,
  );
  if (Array.isArray(data)) {
    return { results: data, next: null, count: data.length };
  }
  return { results: data.results, next: data.next, count: data.count };
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Live Events kinds, matching the tab keys the container page reads/writes
 * in ?tab= and the copilot's deep links use in ?kind=. */
export type LiveEventKind = "classes" | "streams" | "zoom" | "onsite";

/** Direct-link support: a copilot answer or a shared URL can point at
 * /admin/live?tab=<kind>&event=<id> to open one specific item's edit panel —
 * without going through MediaBrowser's list, which may have that item on a
 * later page or hidden by an active filter. Reads the URL once on mount
 * (same window.location.search convention as the copilot drawer, avoiding
 * useSearchParams' Suspense bailout) and fetches the item directly from its
 * detail endpoint. Returns null (not loading, nothing to show) when this
 * tab isn't the one named in ?tab=, or there's no ?event= at all. */
export function useDeepLinkedItem<T extends LiveItem>(
  kind: LiveEventKind,
  detailPath: (id: string) => string,
) {
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestedId, setRequestedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== kind) return;
    const id = params.get("event");
    if (!id) return;
    setRequestedId(id);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const found = await clientFetch<T>(detailPath(id));
        if (!cancelled) setItem(found);
      } catch {
        // Deleted/wrong id — the tab just shows its normal list, no crash.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const clear = () => {
    setItem(null);
    setRequestedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("event");
    url.searchParams.delete("kind");
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  return { item, loading, requestedId, clear, setItem };
}
