"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";

import { PageState } from "@/components/ui/page-state";
import { SkeletonList, SkeletonPageHeader } from "@/components/ui/skeletons";
import { AnnouncementDetail, getAnnouncement } from "@/lib/announcements";

const STATUS_FILTERS = ["all", "sent", "failed", "expired", "none"] as const;

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAnnouncement(Number(id))
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          toast.error("Couldn't load the announcement.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const rows = useMemo(
    () =>
      (data?.recipients ?? []).filter(
        (r) => statusFilter === "all" || r.push_status === statusFilter,
      ),
    [data, statusFilter],
  );

  const readCount = data?.recipients.filter((r) => r.read_at).length ?? 0;

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="mx-auto max-w-2xl space-y-4 p-4">
          <SkeletonPageHeader />
          <SkeletonList count={4} />
        </div>
      }
      className="mx-auto max-w-2xl space-y-4 p-4"
    >
      {data && (
        <>
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
        </>
      )}
    </PageState>
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
