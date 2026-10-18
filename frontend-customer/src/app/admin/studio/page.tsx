"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { StudioList, StudioSkeleton } from "@/components/studio/studio-list";
import { PageState } from "@/components/ui/page-state";
import { getTargets } from "@/lib/designs-api";
import type { DesignTarget } from "@/types/design";

/** Every course and event series she can put a cover on, each with the cover it wears. */
export default function PhotoStudioPage() {
  const t = useTranslations("admin");
  const [targets, setTargets] = useState<DesignTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTargets()
      .then((data) => {
        if (!cancelled) setTargets(data.targets);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
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
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.studio")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("studio.subtitle")}</p>
      </div>
      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<StudioSkeleton />}
      >
        <StudioList targets={targets} />
      </PageState>
    </div>
  );
}
