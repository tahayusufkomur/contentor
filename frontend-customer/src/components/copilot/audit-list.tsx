"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCopilotAudit, undoCopilotAction } from "@/lib/copilot/api";
import {
  announceAssistantApplied,
  announceSiteUpdated,
} from "@/lib/site-events";
import type { CopilotAuditEntry } from "@/lib/copilot/types";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { signerOf } from "@/lib/copilot/team";
import { SpecialistFace } from "./specialist-face";

/** The face of a change she made herself: a plain person, not a specialist's. Decorative: the row names
 *  who made it in words for a screen reader. */
function YourFace() {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
    >
      <User className="size-3" />
    </span>
  );
}

/** One change, with Undo while the server says it can still be taken back. */
function AuditRow({
  entry,
  onUndone,
}: {
  entry: CopilotAuditEntry;
  onUndone: () => void;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { run: undo, loading } = useAsyncAction(
    async () => {
      const res = await undoCopilotAction(entry.id);
      announceSiteUpdated();
      announceAssistantApplied({
        kind: `undo:${res.undone}`,
        id: res.id ?? undefined,
      });
      router.refresh();
      toast.success(t("dock.undoneToast"));
      onUndone();
    },
    {
      // A 400 is the server declining on purpose (she changed it since, or a
      // newer change sits on top); anything else is a plain failure.
      onError: (err) => {
        toast.error(
          err instanceof ApiError && err.status === 400
            ? t("dock.undoRefused")
            : t("dock.undoFailed"),
        );
        onUndone();
      },
    },
  );
  const signer = signerOf(entry);
  return (
    <li className="flex items-center gap-3 p-3">
      {signer === "you" ? (
        <YourFace />
      ) : (
        <SpecialistFace k={signer} size="sm" />
      )}
      <span className="sr-only">
        {signer === "you"
          ? t("dock.you")
          : t(`team.specialists.${signer}.name`)}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            entry.undone
              ? "block text-sm text-muted-foreground line-through"
              : "block text-sm"
          }
        >
          {entry.summary || entry.kind}
        </span>
        <time
          dateTime={entry.created_at}
          className="text-xs text-muted-foreground"
        >
          {new Date(entry.created_at).toLocaleString()}
          {entry.undone ? ` · ${t("dock.undone")}` : ""}
        </time>
      </span>
      {entry.undoable && (
        <Button
          size="sm"
          variant="ghost"
          onClick={undo}
          loading={loading}
          loadingText={t("dock.undoing")}
        >
          {t("dock.undo")}
        </Button>
      )}
    </li>
  );
}

/** Everything the assistant has applied, newest first. */
export function CopilotAuditList() {
  const t = useTranslations("admin");
  const [entries, setEntries] = useState<CopilotAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // After an undo the list reloads under her eyes: rows stay, no skeleton.
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!loaded.current) setLoading(true);
    setError(false);
    fetchCopilotAudit()
      .then((res) => {
        if (cancelled) return;
        loaded.current = true;
        setEntries(res.entries);
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
              <AuditRow
                key={e.id}
                entry={e}
                onUndone={() => setReloadKey((k) => k + 1)}
              />
            ))}
          </ul>
        )}
      </PageState>
    </div>
  );
}
