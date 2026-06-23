"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";
import { Repeat } from "lucide-react";

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
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const toggle = async (r: RecurringAnnouncement) => {
    try {
      await patchRecurring(r.id, { is_active: !r.is_active });
      load();
    } catch {
      toast.error("Failed to update");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this recurring announcement?")) return;
    try {
      await deleteRecurring(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No recurring announcements yet.
      </p>
    );

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
          <div className="flex-1">
            <div className="font-medium">{r.title}</div>
            <div className="text-xs text-muted-foreground">
              <Repeat className="mr-1 inline h-3 w-3 align-[-2px]" />
              {summary(r)}
              {r.is_active ? (
                <>
                  {" "}
                  · next:{" "}
                  {r.next_run_at
                    ? new Date(r.next_run_at).toLocaleString()
                    : "—"}
                </>
              ) : (
                <> · paused</>
              )}
            </div>
          </div>
          <button
            onClick={() => toggle(r)}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            {r.is_active ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => remove(r.id)}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
