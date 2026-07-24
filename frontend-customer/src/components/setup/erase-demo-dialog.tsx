"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { ModalPortal } from "@/components/ui/modal-portal";
import { Spinner } from "@/components/ui/spinner";
import { eraseDemoContent, useDemoContent } from "@/lib/setup-assistant";
import { useAsyncAction } from "@shared/hooks/use-async-action";

export function EraseDemoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const demo = useDemoContent();
  const [error, setError] = useState(false);

  const { run: confirm, loading: busy } = useAsyncAction(
    async () => {
      setError(false);
      const deleted = await eraseDemoContent();
      if (deleted === null) {
        throw new Error(t("setup.erase.error"));
      }
      onClose();
    },
    { errorToast: false, onError: () => setError(true) },
  );

  if (!open || !demo?.present) return null;

  const counts = demo.counts;
  const lines = [
    counts.courses > 0 &&
      t("setup.erase.countCourses", { count: counts.courses }),
    counts.downloads > 0 &&
      t("setup.erase.countDownloads", { count: counts.downloads }),
    counts.live_events > 0 &&
      t("setup.erase.countLive", { count: counts.live_events }),
    counts.plans > 0 && t("setup.erase.countPlans", { count: counts.plans }),
    counts.bundles > 0 &&
      t("setup.erase.countBundles", { count: counts.bundles }),
    counts.videos > 0 && t("setup.erase.countVideos", { count: counts.videos }),
    counts.photos > 0 && t("setup.erase.countPhotos", { count: counts.photos }),
  ].filter(Boolean) as string[];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("setup.erase.cancel")}
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />
        <div className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-base font-semibold">
              {t("setup.erase.title")}
            </h3>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("setup.erase.body")}
          </p>
          <ul className="mb-3 list-inside list-disc text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mb-4 text-sm font-medium">
            {t("setup.erase.keepNote")}
          </p>
          {error && (
            <p className="mb-3 text-sm text-destructive">
              {t("setup.erase.error")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {t("setup.erase.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {busy && <Spinner size="sm" />}
              {t("setup.erase.confirm")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
