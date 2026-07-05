"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";
import { Check, Circle } from "lucide-react";

import { AnnouncementDetail, getAnnouncement } from "@/lib/announcements";

const STATUS_FILTERS = ["all", "sent", "failed", "expired", "none"] as const;

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AnnouncementDetail | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("all");

  useEffect(() => {
    getAnnouncement(Number(id))
      .then(setData)
      .catch(() => setData(null));
  }, [id]);

  const rows = useMemo(
    () =>
      (data?.recipients ?? []).filter(
        (r) => statusFilter === "all" || r.push_status === statusFilter,
      ),
    [data, statusFilter],
  );

  if (!data)
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const readCount = data.recipients.filter((r) => r.read_at).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{data.title}</h1>
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: data.body }}
      />

      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <Stat label="Recipients" value={data.recipient_count} />
        <Stat label="Push sent" value={data.push_sent_count} />
        <Stat label="Read" value={readCount} />
        <Stat
          label="Failed"
          value={
            data.recipients.filter((r) => r.push_status === "failed").length
          }
        />
      </div>

      <div className="flex gap-2 text-xs">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-2 py-1 ${statusFilter === s ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border text-sm">
        {rows.map((r) => (
          <div
            key={r.user_id}
            className="flex items-center justify-between p-2"
          >
            <span>{r.name}</span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{r.push_status}</span>
              <span className="inline-flex items-center gap-1">
                {r.read_at ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {r.read_at ? "read" : "unread"}
              </span>
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-3 text-muted-foreground">No recipients.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
