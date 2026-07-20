"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchActivity,
  fetchActivityFacets,
  fetchLogFacets,
  fetchLogs,
  sinceForRange,
  type ActivityRow,
  type Facet,
  type LogRow,
  type LogsFilters,
  type TimeRange,
} from "@/lib/platform-logs-api";

import { ActivityTable } from "./activity-table";
import {
  FacetChips,
  FacetSelect,
  SearchBox,
  TIME_RANGES,
  UserCombobox,
} from "./filters";
import { LogsTable } from "./logs-table";

type Tab = "logs" | "activity";
const PARAM_KEYS = [
  "level",
  "container",
  "kind",
  "method",
  "status_class",
  "tenant",
  "user",
  "ip",
  "session",
  "q",
] as const;

export default function AdminLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = (searchParams.get("tab") as Tab) || "logs";
  const range = (searchParams.get("range") as TimeRange) || "24h";
  const params = useMemo(() => {
    const out: LogsFilters = {};
    for (const key of PARAM_KEYS) {
      const v = searchParams.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [searchParams]);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/logs?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [rows, setRows] = useState<LogRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [facets, setFacets] = useState<Record<string, Facet[]>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest searchParams for the debounced search commit — the timeout must
  // rebuild the URL at fire time, not from a stale keystroke-time closure
  // (a chip click landing inside the 300ms window would get reverted).
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);
  // Response sequencing: only the latest load()/loadMore() may write state,
  // so a slow response can't clobber a newer tab/filter's results.
  const seqRef = useRef(0);
  // `since` snapshot of the currently displayed result set; loadMore reuses
  // it so pagination stays on one window while refreshes advance it.
  const sinceRef = useRef("");

  // Clear a pending debounce on unmount so it can't router.replace the
  // browser back to /admin/logs after navigating away.
  useEffect(
    () => () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    },
    [],
  );

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setError("");
    // Fresh window on every fetch — auto-refresh must advance `since`.
    sinceRef.current = sinceForRange(range);
    const filters: LogsFilters = { ...params, since: sinceRef.current };
    try {
      if (tab === "logs") {
        const [page, f] = await Promise.all([
          fetchLogs(filters),
          fetchLogFacets(filters),
        ]);
        if (seq !== seqRef.current) return;
        setRows(page.results);
        setCursor(page.next_cursor);
        setFacets(f as unknown as Record<string, Facet[]>);
      } else {
        const [page, f] = await Promise.all([
          fetchActivity(filters),
          fetchActivityFacets(filters),
        ]);
        if (seq !== seqRef.current) return;
        setActivity(page.results);
        setCursor(page.next_cursor);
        setFacets(f as unknown as Record<string, Facet[]>);
      }
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [tab, params, range]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const seq = ++seqRef.current;
    setLoadingMore(true);
    const filters: LogsFilters = { ...params, since: sinceRef.current };
    try {
      if (tab === "logs") {
        const page = await fetchLogs(filters, cursor);
        if (seq !== seqRef.current) return;
        setRows((prev) => [...prev, ...page.results]);
        setCursor(page.next_cursor);
      } else {
        const page = await fetchActivity(filters, cursor);
        if (seq !== seqRef.current) return;
        setActivity((prev) => [...prev, ...page.results]);
        setCursor(page.next_cursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const onSearch = (value: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      const next = new URLSearchParams(searchParamsRef.current.toString());
      if (value) next.set("q", value);
      else next.delete("q");
      router.replace(`/admin/logs?${next.toString()}`, { scroll: false });
    }, 300);
  };

  const switchTab = (next: Tab) => {
    // Keep shared dimensions (tenant/user/range), drop tab-specific ones.
    const keep = new URLSearchParams();
    keep.set("tab", next);
    keep.set("range", range);
    for (const key of ["tenant", "user"]) {
      const v = searchParams.get(key);
      if (v) keep.set(key, v);
    }
    router.replace(`/admin/logs?${keep.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Container logs and user activity across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 5s
          </label>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(["logs", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Range
            <select
              value={range}
              onChange={(e) => setParam("range", e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
            >
              {TIME_RANGES.map((r) => (
                <option key={r} value={r}>
                  last {r}
                </option>
              ))}
            </select>
          </label>
          <SearchBox
            key={tab} /* remount on tab switch so dropped q clears the input */
            value={params.q ?? ""}
            onChange={onSearch}
            placeholder={tab === "logs" ? "Search messages…" : "Search paths…"}
          />
          <FacetSelect
            label="Tenant"
            facets={facets.tenants ?? []}
            selected={params.tenant ?? ""}
            onChange={(v) => setParam("tenant", v)}
          />
          <UserCombobox
            facets={facets.users ?? []}
            selected={params.user ?? ""}
            onChange={(v) => setParam("user", v)}
          />
          {params.ip && (
            <button
              onClick={() => setParam("ip", "")}
              className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
              title="Clear IP filter"
            >
              ip: {params.ip} ✕
            </button>
          )}
        </div>
        {tab === "logs" ? (
          <div className="flex flex-wrap gap-4">
            <FacetChips
              label="Level"
              facets={facets.levels ?? []}
              selected={params.level ?? ""}
              onChange={(v) => setParam("level", v)}
            />
            <FacetChips
              label="Container"
              facets={facets.containers ?? []}
              selected={params.container ?? ""}
              onChange={(v) => setParam("container", v)}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            <FacetChips
              label="Kind"
              facets={facets.kinds ?? []}
              selected={params.kind ?? ""}
              onChange={(v) => setParam("kind", v)}
            />
            <FacetChips
              label="Method"
              facets={facets.methods ?? []}
              selected={params.method ?? ""}
              onChange={(v) => setParam("method", v)}
            />
            <FacetChips
              label="Status"
              facets={facets.status_classes ?? []}
              selected={params.status_class ?? ""}
              onChange={(v) => setParam("status_class", v)}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : tab === "logs" ? (
        <LogsTable rows={rows} onUserClick={(u) => setParam("user", u)} />
      ) : (
        <ActivityTable
          rows={activity}
          onUserClick={(u) => setParam("user", u)}
          onIpClick={(ip) => setParam("ip", ip)}
          onSessionClick={(s) => setParam("session", s)}
          onViewLogs={(user) => {
            const next = new URLSearchParams({
              tab: "logs",
              range,
              ...(user ? { user } : {}),
            });
            router.replace(`/admin/logs?${next.toString()}`, { scroll: false });
          }}
        />
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
