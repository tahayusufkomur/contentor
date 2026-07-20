"use client";

import type { ActivityRow } from "@/lib/platform-logs-api";

const STATUS_STYLE = (status: number | null) => {
  if (status == null) return "bg-muted text-muted-foreground";
  if (status >= 500)
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  if (status >= 400)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
};

export function ActivityTable({
  rows,
  onUserClick,
  onIpClick,
  onSessionClick,
  onViewLogs,
}: {
  rows: ActivityRow[];
  onUserClick: (user: string) => void;
  onIpClick: (ip: string) => void;
  onSessionClick: (session: string) => void;
  onViewLogs: (user: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No activity matches the current filters.
      </p>
    );
  }
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="w-40 pb-2 font-medium">Time</th>
          <th className="w-24 pb-2 font-medium">Kind</th>
          <th className="w-48 pb-2 font-medium">Who</th>
          <th className="w-28 pb-2 font-medium">Tenant</th>
          <th className="pb-2 font-medium">Request</th>
          <th className="w-20 pb-2 font-medium">Status</th>
          <th className="w-24 pb-2 font-medium">Session</th>
          <th className="w-20 pb-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b align-top hover:bg-muted/50">
            <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
              {new Date(r.ts).toLocaleString(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </td>
            <td className="py-2 pr-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.kind === "pageview" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}
              >
                {r.kind}
              </span>
            </td>
            <td className="py-2 pr-2 text-xs">
              {r.user_label ? (
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => onUserClick(r.user_label)}
                >
                  {r.user_label}
                </button>
              ) : r.ip ? (
                <button
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title="Filter by this IP"
                  onClick={() => onIpClick(r.ip as string)}
                >
                  {r.ip}
                </button>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-2 pr-2 text-xs">{r.tenant || "—"}</td>
            <td className="py-2 pr-2 font-mono text-xs">
              <span className="block truncate">
                {r.kind === "api" ? `${r.method} ${r.path}` : r.path}
                {r.duration_ms != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {r.duration_ms}ms
                  </span>
                )}
              </span>
            </td>
            <td className="py-2 pr-2">
              {r.status != null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE(r.status)}`}
                >
                  {r.status}
                </span>
              )}
            </td>
            <td className="py-2 pr-2 text-xs">
              {r.session_id ? (
                <button
                  className="font-mono text-primary underline-offset-2 hover:underline"
                  title={r.session_id}
                  onClick={() => onSessionClick(r.session_id)}
                >
                  {r.session_id.slice(0, 8)}
                </button>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 text-xs">
              {r.user_label && (
                <button
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => onViewLogs(r.user_label)}
                >
                  logs →
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
