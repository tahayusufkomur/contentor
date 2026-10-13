"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCopilotAudit } from "@/lib/copilot/api";
import type { CopilotAuditEntry } from "@/lib/copilot/types";

/** Everything the assistant has applied, newest first. */
export function CopilotAuditList() {
  const t = useTranslations("admin");
  const [entries, setEntries] = useState<CopilotAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchCopilotAudit()
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dock.noChangesYet")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 p-3">
                <span className="flex-1 text-sm">{e.summary || e.kind}</span>
                <time
                  dateTime={e.created_at}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {new Date(e.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </PageState>
    </div>
  );
}
