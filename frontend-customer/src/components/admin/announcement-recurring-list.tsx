"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";
import { Repeat } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  RecurringAnnouncement,
  deleteRecurring,
  listRecurring,
  patchRecurring,
} from "@/lib/announcements";
import { useLocale, useTranslations } from "next-intl";
import { weekdayNames } from "@/lib/calendar-utils";

function summary(
  r: RecurringAnnouncement,
  locale: string,
  tr: ReturnType<typeof useTranslations>,
): string {
  const time = r.send_time?.slice(0, 5);
  if (r.frequency === "daily") return tr("daily", { time });
  if (r.frequency === "weekly")
    return tr("weekly", {
      day: weekdayNames(locale, "long")[r.weekday ?? 0],
      time,
    });
  return tr("monthly", { day: r.day_of_month ?? 1, time });
}

export default function AnnouncementRecurringList({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const tr = useTranslations("admin.messages.recurring");
  const [items, setItems] = useState<RecurringAnnouncement[]>([]);

  const load = () =>
    listRecurring()
      .then(setItems)
      .catch(() => {
        setItems([]);
        toast.error(tr("loadError"));
      });
  useEffect(() => {
    load();
  }, [refreshKey]);

  if (items.length === 0)
    return <p className="p-4 text-sm text-muted-foreground">{tr("empty")}</p>;

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((r) => (
        <RecurringRow key={r.id} item={r} onChanged={load} />
      ))}
    </div>
  );
}

function RecurringRow({
  item,
  onChanged,
}: {
  item: RecurringAnnouncement;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const tr = useTranslations("admin.messages.recurring");
  const tc = useTranslations("common.actions");
  const { run: toggle, loading: toggling } = useAsyncAction(
    async () => {
      await patchRecurring(item.id, { is_active: !item.is_active });
      onChanged();
    },
    { errorToast: tr("updateError") },
  );

  const { run: remove, loading: removing } = useAsyncAction(
    async () => {
      if (!confirm(tr("confirmDelete"))) return;
      await deleteRecurring(item.id);
      toast.success(tr("deleted"));
      onChanged();
    },
    { errorToast: tr("deleteError") },
  );

  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1">
        <div className="font-medium">{item.title}</div>
        <div className="text-xs text-muted-foreground">
          <Repeat className="mr-1 inline h-3 w-3 align-[-2px]" />
          {summary(item, locale, tr)}
          {item.is_active ? (
            <>
              {" "}
              ·{" "}
              {tr("nextRun", {
                when: item.next_run_at
                  ? new Date(item.next_run_at).toLocaleString(locale)
                  : "—",
              })}
            </>
          ) : (
            <> · {tr("paused")}</>
          )}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={toggling}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {toggling ? (
          <Spinner size="sm" />
        ) : item.is_active ? (
          tr("pause")
        ) : (
          tr("resume")
        )}
      </button>
      <button
        onClick={remove}
        disabled={removing}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {removing ? <Spinner size="sm" /> : tc("delete")}
      </button>
    </div>
  );
}
