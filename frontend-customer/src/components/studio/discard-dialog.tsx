"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";

/** Asks before a draft is thrown away. "Keep editing" has the focus: Enter does not destroy anything. */
export function DiscardDialog({
  title,
  discarding,
  onDiscard,
  onCancel,
}: {
  title: string;
  discarding: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.studio.editor");
  const headingId = useId();
  const bodyId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("discardCancel")}
          onClick={onCancel}
          className="absolute inset-0 bg-black/50"
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-describedby={bodyId}
          className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl"
        >
          <h2 id={headingId} className="text-base font-semibold">
            {t("discardTitle")}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm text-muted-foreground">
            {t("discardBody", { title })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={discarding}
              autoFocus
            >
              {t("discardCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={onDiscard}
              loading={discarding}
            >
              {t("discard")}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
