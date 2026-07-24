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

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function summary(r: RecurringAnnouncement): string {
  const t = r.send_time?.slice(0, 5);
  if (r.frequency === "daily") return `Daily at ${t}`;
  if (r.frequency === "weekly")
    return `Every ${WEEKDAYS[r.weekday ?? 0]} at ${t}`;
  return `Monthly on day ${r.day_of_month} at ${t}`;
}

export default function AnnouncementRecurringList({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [items, setItems] = useState<RecurringAnnouncement[]>([]);

  const load = () =>
    listRecurring()
      .then(setItems)
      .catch(() => {
        setItems([]);
        toast.error("Couldn't load recurring announcements.");
      });
  useEffect(() => {
    load();
  }, [refreshKey]);

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No recurring announcements yet.
      </p>
    );

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
  const { run: toggle, loading: toggling } = useAsyncAction(
    async () => {
      await patchRecurring(item.id, { is_active: !item.is_active });
      onChanged();
    },
    { errorToast: "Failed to update" },
  );

  const { run: remove, loading: removing } = useAsyncAction(
    async () => {
      if (!confirm("Delete this recurring announcement?")) return;
      await deleteRecurring(item.id);
      toast.success("Deleted");
      onChanged();
    },
    { errorToast: "Failed to delete" },
  );

  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1">
        <div className="font-medium">{item.title}</div>
        <div className="text-xs text-muted-foreground">
          <Repeat className="mr-1 inline h-3 w-3 align-[-2px]" />
          {summary(item)}
          {item.is_active ? (
            <>
              {" "}
              · next:{" "}
              {item.next_run_at
                ? new Date(item.next_run_at).toLocaleString()
                : "—"}
            </>
          ) : (
            <> · paused</>
          )}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={toggling}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {toggling ? <Spinner size="sm" /> : item.is_active ? "Pause" : "Resume"}
      </button>
      <button
        onClick={remove}
        disabled={removing}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {removing ? <Spinner size="sm" /> : "Delete"}
      </button>
    </div>
  );
}
