"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { openCoverStudio } from "@/lib/covers/open-studio";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** Opens the photo studio on a course or event series (see `openCoverStudio`). It reads "Design a
 *  cover" unless given another label; a failure is a toast and she stays where she is. */
export function OpenStudioButton({
  target,
  from,
  unsaved,
  children,
  "aria-describedby": describedBy,
}: {
  target: { target_kind: string; target_key: string };
  /** A kept design to start the draft as a copy of. */
  from?: string;
  /** The form this sits in has edits not saved yet, and leaving would lose them: the button waits,
   *  and says why beside it. */
  unsaved?: boolean;
  children?: ReactNode;
  "aria-describedby"?: string;
}) {
  const t = useTranslations("admin.studio");
  const hintId = useId();
  const navigate = useNavigate();
  const { run, loading } = useAsyncAction(() =>
    openCoverStudio(target, navigate, from),
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        loading={loading}
        disabled={unsaved}
        aria-describedby={unsaved ? hintId : describedBy}
      >
        {children ?? t("design")}
      </Button>
      {unsaved && (
        <span id={hintId} className="text-xs text-muted-foreground">
          {t("saveFirst")}
        </span>
      )}
    </>
  );
}
