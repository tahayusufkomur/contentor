"use client";

import { useTranslations } from "next-intl";
import type { SaveState } from "@/components/studio/use-cover-draft";

/** Whether the draft is saved, being saved, or failed to save (with a way to try again). */
export function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  const t = useTranslations("admin.studio.editor");
  return (
    <span
      role="status"
      className="min-w-[6.5rem] text-xs text-muted-foreground sm:text-right"
    >
      {state === "saving" && t("saving")}
      {state === "saved" && t("saved")}
      {state === "error" && (
        <>
          {t("saveFailed")}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            {t("retry")}
          </button>
        </>
      )}
    </span>
  );
}
