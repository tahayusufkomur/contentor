"use client";

import { useState } from "react";

import type { LogRow } from "@/lib/platform-logs-api";

const LEVEL_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  WARNING:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INFO: "bg-muted text-muted-foreground",
  DEBUG: "bg-muted text-muted-foreground",
};

export function LogsTable({
  rows,
  onUserClick,
}: {
  rows: LogRow[];
  onUserClick: (user: string) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No log lines match the current filters.
      </p>
    );
  }
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="w-44 pb-2 font-medium">Time</th>
          <th className="w-24 pb-2 font-medium">Level</th>
          <th className="w-32 pb-2 font-medium">Container</th>
          <th className="w-28 pb-2 font-medium">Tenant</th>
          <th className="w-44 pb-2 font-medium">User</th>
          <th className="pb-2 font-medium">Message</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            tabIndex={0}
            role="button"
            aria-expanded={expanded === r.id}
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                if (e.key === " ") e.preventDefault();
                setExpanded(expanded === r.id ? null : r.id);
              }
            }}
            className="cursor-pointer border-b align-top hover:bg-muted/50"
          >
            <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
              {new Date(r.ts).toLocaleString(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                fractionalSecondDigits: 3,
              })}
            </td>
            <td className="py-2 pr-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[r.level] ?? ""}`}
              >
                {r.level}
              </span>
            </td>
            <td className="py-2 pr-2 text-xs">{r.container}</td>
            <td className="py-2 pr-2 text-xs">{r.tenant || "—"}</td>
            <td className="py-2 pr-2 text-xs">
              {r.user_label ? (
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUserClick(r.user_label);
                  }}
                >
                  {r.user_label}
                </button>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 font-mono text-xs">
              {expanded === r.id ? (
                <pre className="whitespace-pre-wrap break-all">{r.message}</pre>
              ) : (
                <span className="block truncate">{r.message}</span>
              )}
              {expanded === r.id && r.logger_name && (
                <span className="mt-1 block text-muted-foreground">
                  logger: {r.logger_name}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
