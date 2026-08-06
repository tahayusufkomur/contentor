"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StaleContainer } from "@/components/ui/stale-container";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  AnnouncementListItem,
  ComposePrefill,
  deleteAnnouncement,
  draftToComposePrefill,
  getAnnouncement,
  listAnnouncements,
} from "@/lib/announcements";

export default function AnnouncementHistory({
  refreshKey,
  onReviewDraft,
}: {
  refreshKey: number;
  /** A draft's "Review & send" was clicked — hands the full draft content
   * up so the page can load it into AnnouncementCompose as a template. */
  onReviewDraft?: (draft: { id: number; prefill: ComposePrefill }) => void;
}) {
  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return listAnnouncements()
      .then(setItems)
      .catch(() => {
        setItems([]);
        toast.error("Couldn't load announcements.");
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [refreshKey]);

  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">No announcements yet.</p>
    );

  return (
    // Refetches when a new announcement is sent (refreshKey bump) while this
    // list is already on screen — dim in place instead of swapping silently.
    <StaleContainer pending={loading && items.length > 0}>
      <div className="divide-y divide-border rounded-xl border border-border">
        {items.map((a) => (
          <HistoryRow
            key={a.id}
            item={a}
            onRemoved={load}
            onReviewDraft={onReviewDraft}
          />
        ))}
      </div>
    </StaleContainer>
  );
}

function HistoryRow({
  item,
  onRemoved,
  onReviewDraft,
}: {
  item: AnnouncementListItem;
  onRemoved: () => void;
  onReviewDraft?: (draft: { id: number; prefill: ComposePrefill }) => void;
}) {
  const { run: remove, loading: removing } = useAsyncAction(
    async () => {
      if (!confirm("Delete this announcement?")) return;
      await deleteAnnouncement(item.id);
      toast.success("Deleted");
      onRemoved();
    },
    { errorToast: "Failed to delete" },
  );

  const { run: review, loading: reviewing } = useAsyncAction(
    async () => {
      const draft = await getAnnouncement(item.id);
      onReviewDraft?.({ id: draft.id, prefill: draftToComposePrefill(draft) });
    },
    { errorToast: "Couldn't load the draft" },
  );

  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1">
        <Link
          href={`/admin/notifications/${item.id}`}
          className="font-medium hover:underline"
        >
          {item.title}
        </Link>
        <div className="text-xs text-muted-foreground">
          {item.status === "draft" ? (
            <span>📝 Draft · not sent yet</span>
          ) : item.status === "scheduled" ? (
            <span>
              ⏰ Scheduled ·{" "}
              {item.scheduled_at
                ? new Date(item.scheduled_at).toLocaleString()
                : ""}
            </span>
          ) : (
            <span>
              {item.recipient_count} recipients · {item.push_sent_count} push ·{" "}
              {item.read_count} read
            </span>
          )}
        </div>
      </div>
      {item.status === "draft" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={review}
          loading={reviewing}
          loadingText="Loading…"
        >
          Review & send
        </Button>
      )}
      <button
        onClick={remove}
        disabled={removing}
        className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {removing ? (
          <Spinner size="sm" />
        ) : item.status === "scheduled" ? (
          "Cancel"
        ) : (
          "Delete"
        )}
      </button>
    </div>
  );
}
