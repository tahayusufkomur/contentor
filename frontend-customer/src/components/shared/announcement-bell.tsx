"use client";

import { useEffect, useState } from "react";

import { Bell } from "lucide-react";

import { FeedItem, getFeed, markRead } from "@/lib/announcements";

export default function AnnouncementBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = () =>
    getFeed()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread_count);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const openItem = async (item: FeedItem) => {
    if (!item.read_at) {
      try {
        const { unread_count } = await markRead(item.id);
        setUnread(unread_count);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i,
          ),
        );
      } catch {
        /* ignore */
      }
    }
    if (item.link) window.location.href = item.link;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2"
        aria-label="Announcements"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto rounded-xl border border-border bg-card p-2 shadow-lg">
          {items.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No announcements.
            </p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className={`block w-full rounded-lg p-2 text-left text-sm ${item.read_at ? "" : "bg-muted/50"}`}
            >
              <div className="font-medium">{item.title}</div>
              <div
                className="prose prose-xs line-clamp-2 max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: item.body }}
              />
              <div className="text-[10px] text-muted-foreground">
                {new Date(item.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
