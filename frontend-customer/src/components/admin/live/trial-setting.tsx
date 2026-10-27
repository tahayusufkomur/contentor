"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";

import { formatDate } from "./shared";
import type { EventKind } from "./kinds";

/** What the server says about a weekly class's free trial
 *  (apps.live.series.trial_state). */
interface Trial {
  on: boolean;
  available: boolean;
  session_at: string | null;
}

/** "Make the first session a free trial?": an optional switch on the page of
 *  any session of a weekly class. It is the whole series' setting, so it
 *  shows the same on every session; it is hidden where it cannot apply (a
 *  Zoom session, a free class, a one-off). `onChanged` runs after a change. */
export function TrialSetting({
  kind,
  id,
  onChanged,
}: {
  kind: EventKind;
  id: number;
  onChanged?: () => void;
}) {
  const t = useTranslations("admin.events");
  const url = `/api/v1/admin/events/${kind}/${id}/trial/`;
  const [trial, setTrial] = useState<Trial | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const help = useId();

  const load = useCallback(async () => {
    try {
      setTrial(await clientFetch<Trial>(url));
    } catch {
      setTrial(null); // nothing to offer without an answer
    }
  }, [url]);
  useEffect(() => {
    setTrial(null);
    void load();
  }, [load]);

  const { run: toggle, loading } = useAsyncAction(
    async (on: boolean) => {
      setTrial(
        await clientFetch<Trial>(url, {
          method: "PUT",
          body: JSON.stringify({ on }),
        }),
      );
      toast.success(t(on ? "trialTurnedOn" : "trialTurnedOff"));
      onChanged?.();
    },
    {
      onError: (err) =>
        toast.error(
          (err instanceof ApiError && (err.data.detail as string)) ||
            t("trialError"),
        ),
    },
  );

  if (kind === "zoom") return null;
  if (!trial)
    return <Skeleton className="h-16 w-full rounded-md" aria-hidden />;
  if (!trial.on && !trial.available) return null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start gap-3">
        <Switch
          aria-labelledby={`${help}-label`}
          checked={trial.on}
          disabled={loading}
          onCheckedChange={(on) => toggle(on)}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <p id={`${help}-label`} className="text-sm font-medium">
            {t("trialTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {trial.on && trial.session_at
              ? t("trialOn", { when: formatDate(trial.session_at) })
              : t("trialHint")}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={helpOpen}
        aria-controls={help}
        onClick={() => setHelpOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {t("trialHelpTerm")}
      </button>
      {helpOpen && (
        <p
          id={help}
          className="rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground"
        >
          {t("trialHelp")}
        </p>
      )}
    </div>
  );
}
