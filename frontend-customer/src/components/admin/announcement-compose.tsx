"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { useRichEditor } from "@/components/owner/rich-editor";
import { AnnouncementFilters, createAnnouncement, previewAudience } from "@/lib/announcements";

const PLATFORMS: ("ios" | "android" | "desktop")[] = ["ios", "android", "desktop"];

export default function AnnouncementCompose({ onSent }: { onSent: () => void }) {
  const editor = useRichEditor();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [filters, setFilters] = useState<AnnouncementFilters>({});
  const [scheduledAt, setScheduledAt] = useState("");
  const [reach, setReach] = useState<{ audience: number; push_reachable: number } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewAudience(filters)
      .then((r) => !cancelled && setReach(r))
      .catch(() => !cancelled && setReach(null));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const togglePlatform = (p: "ios" | "android" | "desktop") =>
    setFilters((f) => {
      const set = new Set(f.platform ?? []);
      set.has(p) ? set.delete(p) : set.add(p);
      return { ...f, platform: set.size ? Array.from(set) : undefined };
    });

  const send = async () => {
    if (!title.trim()) return;
    setSending(true);
    try {
      await createAnnouncement({
        title: title.trim(),
        body,
        link: link.trim() || undefined,
        filters,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success(scheduledAt ? "Announcement scheduled" : "Announcement sent");
      setTitle("");
      setBody("");
      setLink("");
      setFilters({});
      setScheduledAt("");
      onSent();
    } catch {
      toast.error("Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <button
        type="button"
        onClick={() => editor?.openRichEditor({ value: body, title: "Announcement body", onSave: setBody })}
        className="w-full rounded-lg border border-dashed border-border bg-background p-3 text-left text-sm text-muted-foreground"
      >
        {body ? <span dangerouslySetInnerHTML={{ __html: body }} /> : "Write announcement body…"}
      </button>

      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Link (optional, e.g. /courses/foo)"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <div className="font-medium">Audience filters</div>
        <div className="flex flex-wrap gap-2">
          {(["pwa", "browser"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, app_type: f.app_type === t ? undefined : t }))}
              className={`rounded-full border px-3 py-1 ${filters.app_type === t ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {t === "pwa" ? "📱 PWA" : "🌐 Browser"}
            </button>
          ))}
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-full border px-3 py-1 ${filters.platform?.includes(p) ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, push_enabled: f.push_enabled ? undefined : true }))}
            className={`rounded-full border px-3 py-1 ${filters.push_enabled ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            Push-enabled only
          </button>
        </div>
        {reach && (
          <div className="text-muted-foreground">
            Reaches <strong>{reach.push_reachable}</strong> via push · <strong>{reach.audience}</strong> in feed
          </div>
        )}
      </div>

      <label className="block text-sm">
        Schedule (optional)
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-background p-1"
        />
      </label>

      <button
        onClick={send}
        disabled={sending || !title.trim()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {scheduledAt ? "Schedule" : "Send now"}
      </button>
    </div>
  );
}
