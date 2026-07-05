"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import {
  AnnouncementListItem,
  deleteAnnouncement,
  listAnnouncements,
} from "@/lib/announcements";

export default function AnnouncementHistory({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [items, setItems] = useState<AnnouncementListItem[]>([]);

  const load = () =>
    listAnnouncements()
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const remove = async (id: number) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">No announcements yet.</p>
    );

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-3 text-sm">
          <div className="flex-1">
            <Link
              href={`/admin/notifications/${a.id}`}
              className="font-medium hover:underline"
            >
              {a.title}
            </Link>
            <div className="text-xs text-muted-foreground">
              {a.status === "scheduled" ? (
                <span>
                  ⏰ Scheduled ·{" "}
                  {a.scheduled_at
                    ? new Date(a.scheduled_at).toLocaleString()
                    : ""}
                </span>
              ) : (
                <span>
                  {a.recipient_count} recipients · {a.push_sent_count} push ·{" "}
                  {a.read_count} read
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => remove(a.id)}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
          >
            {a.status === "scheduled" ? "Cancel" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
