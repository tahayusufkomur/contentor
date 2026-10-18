"use client";

// What can be done to a design in the photo studio's editor: how much it saves, undoes, discards and keeps.
// The phone's header and the workspace's top bar both show it.

import { useTranslations } from "next-intl";
import { Redo2, Undo2 } from "lucide-react";
import { SaveStatus } from "@/components/studio/save-status";
import type { CoverDraft } from "@/components/studio/use-cover-draft";
import { Button } from "@/components/ui/button";
import type { DesignRecord } from "@/types/design";

/** What can be done to this design: how much it saves, undoes, discards and keeps. On the phone it sits
 *  in the header; in the workspace, in the top bar. */
export function DraftActions({
  draft,
  design,
  editable,
  canCopy,
  isCourse,
  onDiscard,
  inBar = false,
}: {
  draft: CoverDraft;
  design: DesignRecord;
  editable: boolean;
  /** A kept or retired design whose course or event is still there can be copied. */
  canCopy: boolean;
  isCourse: boolean;
  onDiscard: () => void;
  /** In the workspace's top bar: one row, buttons no wider than their words. */
  inBar?: boolean;
}) {
  const t = useTranslations("admin.studio");
  const grow = inBar ? undefined : "flex-1 sm:flex-none";
  return (
    // On a phone the saving state and Undo sit above the buttons, which share the row below.
    <div
      className={
        inBar
          ? "flex items-center gap-2"
          : "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
      }
    >
      {editable && (
        <div className="flex items-center gap-1">
          <SaveStatus state={draft.saveState} onRetry={draft.retrySave} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("editor.undo")}
            disabled={!draft.canUndo || draft.busy}
            onClick={draft.undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("editor.redo")}
            disabled={!draft.canRedo || draft.busy}
            onClick={draft.redo}
          >
            <Redo2 />
          </Button>
        </div>
      )}
      <div className={inBar ? "flex gap-2" : "flex w-full gap-2 sm:w-auto"}>
        {design.state === "draft" && (
          <Button
            variant="outline"
            className={grow}
            disabled={draft.locked}
            onClick={onDiscard}
          >
            {t("editor.discard")}
          </Button>
        )}
        {editable && (
          <Button
            className={grow}
            onClick={() => void draft.keep()}
            loading={draft.keeping}
            disabled={draft.locked}
          >
            {isCourse ? t("editor.keepCourse") : t("editor.keepEvent")}
          </Button>
        )}
        {design.state !== "draft" && canCopy && (
          <Button
            className={grow}
            onClick={() => void draft.editCopy()}
            loading={draft.copying}
            disabled={draft.busy}
          >
            {t("editCopy")}
          </Button>
        )}
      </div>
    </div>
  );
}
