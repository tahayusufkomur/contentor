"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { DownloadForm } from "@/components/admin/download-form";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { clientFetch } from "@/lib/api-client";
import type { DownloadFile } from "@/types/download";

export default function DownloadPage() {
  const t = useTranslations("admin.downloads");
  const { id } = useParams<{ id: string }>();
  const [download, setDownload] = useState<DownloadFile | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    clientFetch<DownloadFile>(`/api/v1/downloads/${id}/`)
      .then(setDownload)
      .catch(setError);
  }, [id]);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <NavLink href="/admin/downloads" aria-label={t("back")}>
            <ArrowLeft className="h-4 w-4" />
          </NavLink>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t("edit")}</h1>
      </div>
      <PageState
        loading={!download && !error}
        error={error}
        onRetry={load}
        skeleton={<SkeletonForm fields={5} />}
      >
        {download && <DownloadForm key={download.id} download={download} />}
      </PageState>
    </div>
  );
}
