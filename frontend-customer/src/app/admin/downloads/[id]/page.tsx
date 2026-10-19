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
import { startActiveTime } from "@/lib/focus/active-time";
import { fetchCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import {
  activeCreation,
  openCreationFor,
  setActiveCreation,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
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
  // In focus mode: the saved download again, without the skeleton.
  const reload = useCallback(() => {
    clientFetch<DownloadFile>(`/api/v1/downloads/${id}/`)
      .then(setDownload)
      .catch(() => {});
  }, [id]);

  // Focus mode: a download she is still making in it reopens there, where she
  // stopped; the guide and the form follow the creation from here.
  const overview = useFocusOverview();
  const active = useActiveCreation();
  const downloadId = download?.id;
  const mine =
    !!active &&
    active.kind === "download" &&
    downloadId !== undefined &&
    active.record?.id === downloadId;
  const creationId =
    downloadId === undefined
      ? null
      : (openCreationFor(overview, "download", downloadId) ??
        (mine ? active.id : null));
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("download"));
    // Just made on the new-download page: the guide already holds it.
    if (activeCreation()?.id === creationId) return;
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  const focusing = !!download && mine && active.id !== 0;
  const copy = active?.copy;
  const focus = focusing
    ? {
        record: `download:${download.id}`,
        // A failed or stopped run is not replayed: the page keeps what is saved.
        runId:
          copy?.status === "building" || copy?.status === "ready"
            ? copy.run
            : null,
        reload,
      }
    : undefined;

  return (
    <div className="space-y-6">
      {!focusing && (
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <NavLink href="/admin/downloads" aria-label={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </NavLink>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{t("edit")}</h1>
        </div>
      )}
      <PageState
        loading={!download && !error}
        error={error}
        onRetry={load}
        skeleton={<SkeletonForm fields={5} />}
      >
        {download && (
          <DownloadForm key={download.id} download={download} focus={focus} />
        )}
      </PageState>
    </div>
  );
}
