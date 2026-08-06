"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCopilotAudit } from "@/lib/copilot/api";
import type { CopilotAuditEntry } from "@/lib/copilot/types";

export const dynamic = "force-dynamic";

/** The AI editing surface moved onto the site itself (Coach Copilot,
 * spec 2026-08-04). This page is the discoverable admin entry plus the
 * assistant's "what changed" audit feed. */
export default function AdminSiteAiPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("siteAi.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("siteAi.subtitle")}</p>
      </div>
      <Button asChild variant="brand">
        <a href="/?copilot=1" target="_blank" rel="noopener noreferrer">
          <Sparkles className="size-4" aria-hidden />
          {t("siteAi.launch")}
        </a>
      </Button>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />
          {t("siteAi.recentChanges")}
        </h2>
        <PageState
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          skeleton={
            <div className="space-y-2">
              <Skeleton className="h-12 w-full max-w-2xl" />
              <Skeleton className="h-12 w-full max-w-2xl" />
              <Skeleton className="h-12 w-full max-w-2xl" />
            </div>
          }
        >
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("siteAi.noChangesYet")}
            </p>
          ) : (
            <ul className="max-w-2xl divide-y rounded-lg border">
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
      </section>
    </div>
  );
}
