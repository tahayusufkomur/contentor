// Superadmin log/activity viewer client — same-origin cookie auth like
// platform-email-api.ts.

async function clientFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.detail) || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface LogRow {
  id: number;
  ts: string;
  container: string;
  stream: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  logger_name: string;
  tenant: string;
  user_label: string;
  message: string;
}

export interface ActivityRow {
  id: number;
  ts: string;
  kind: "api" | "pageview";
  tenant: string;
  user_label: string;
  ip: string | null;
  session_id: string;
  method: string;
  path: string;
  status: number | null;
  duration_ms: number | null;
  referrer: string;
  user_agent: string;
}

export interface Facet {
  value: string;
  count: number;
}

export interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

export type LogsFilters = Record<string, string>; // param name -> comma-joined values

function qs(filters: LogsFilters, cursor?: string | null): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  if (cursor) search.set("cursor", cursor);
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const fetchLogs = (f: LogsFilters, cursor?: string | null) =>
  clientFetch<Page<LogRow>>(`/api/v1/platform/logs/${qs(f, cursor)}`);
export const fetchLogFacets = (f: LogsFilters) =>
  clientFetch<{
    levels: Facet[];
    containers: Facet[];
    tenants: Facet[];
    users: Facet[];
  }>(`/api/v1/platform/logs/facets/${qs(f)}`);
export const fetchActivity = (f: LogsFilters, cursor?: string | null) =>
  clientFetch<Page<ActivityRow>>(`/api/v1/platform/activity/${qs(f, cursor)}`);
export const fetchActivityFacets = (f: LogsFilters) =>
  clientFetch<{
    kinds: Facet[];
    methods: Facet[];
    status_classes: Facet[];
    tenants: Facet[];
    users: Facet[];
  }>(`/api/v1/platform/activity/facets/${qs(f)}`);

export type TimeRange = "15m" | "1h" | "6h" | "24h" | "7d" | "14d";

const RANGE_MS: Record<TimeRange, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "14d": 14 * 86_400_000,
};

export function sinceForRange(range: TimeRange): string {
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}
