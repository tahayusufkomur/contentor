"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Linkify } from "@/components/community/linkify";
import { timeAgo } from "@/components/community/post-card";
import {
  approvePost,
  getModerationQueue,
  type ModerationQueue,
  type QueueReport,
  removePost,
  resolveReport,
} from "@/lib/community-admin";
import type { CommunityPost } from "@/types/community";
import { useAsyncAction } from "@shared/hooks/use-async-action";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  inappropriate: "Inappropriate",
  harassment: "Harassment",
  other: "Other",
};

function ReportCard({
  report,
  onAction,
}: {
  report: QueueReport;
  onAction: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<"remove" | "keep" | null>(
    null,
  );
  const { run: act, loading: busy } = useAsyncAction(
    async (action: "remove" | "keep") => {
      setPendingAction(action);
      await resolveReport(report.id, action);
      toast.success(action === "remove" ? "Content removed." : "Content kept.");
      onAction();
    },
    { errorToast: "Couldn't resolve the report." },
  );
  const target = report.post ?? report.comment;
  if (!target) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="destructive">
            {REASON_LABELS[report.reason] ?? report.reason}
          </Badge>
          <span className="text-muted-foreground">
            Reported by {report.reporter.display_name} ·{" "}
            {timeAgo(report.created_at)}
          </span>
        </div>
        {report.detail && (
          <p className="text-sm italic text-muted-foreground">
            “{report.detail}”
          </p>
        )}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {report.target_type === "post" ? "Post" : "Comment"} by{" "}
            {target.author.display_name}
          </div>
          <Linkify text={target.body} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            loading={busy && pendingAction === "remove"}
            loadingText="Removing…"
            disabled={busy}
            onClick={() => void act("remove")}
          >
            Remove
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={busy && pendingAction === "keep"}
            loadingText="Keeping…"
            disabled={busy}
            onClick={() => void act("keep")}
          >
            Keep
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Per-row: each pending post needs its own in-flight tracking, otherwise a
// single shared flag would freeze every other row's buttons while one post
// is being approved/removed (see ReportCard above for the same pattern).
function PendingPostCard({
  post,
  onAction,
}: {
  post: CommunityPost;
  onAction: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<
    "approve" | "remove" | null
  >(null);
  const { run: act, loading: busy } = useAsyncAction(
    async (action: "approve" | "remove") => {
      setPendingAction(action);
      if (action === "approve") {
        await approvePost(post.id);
        toast.success("Post approved.");
      } else {
        await removePost(post.id);
        toast.success("Post removed.");
      }
      onAction();
    },
    { errorToast: "Couldn't update the post." },
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="text-sm text-muted-foreground">
          {post.author.display_name} · {timeAgo(post.created_at)}
        </div>
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <Linkify text={post.body} />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={busy && pendingAction === "approve"}
            loadingText="Approving…"
            disabled={busy}
            onClick={() => void act("approve")}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
          </Button>
          <Button
            variant="destructive"
            size="sm"
            loading={busy && pendingAction === "remove"}
            loadingText="Removing…"
            disabled={busy}
            onClick={() => void act("remove")}
          >
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsQueue({ onResolved }: { onResolved: () => void }) {
  const [queue, setQueue] = useState<ModerationQueue | null>(null);

  const load = useCallback(() => {
    getModerationQueue()
      .then(setQueue)
      .catch(() => toast.error("Couldn't load the queue."));
  }, []);

  useEffect(load, [load]);

  const refresh = () => {
    load();
    onResolved();
  };

  const empty =
    !!queue && queue.reports.length === 0 && queue.pending_posts.length === 0;

  return (
    <PageState
      loading={queue === null}
      skeleton={<Skeleton className="h-48 w-full" />}
    >
      {queue &&
        (empty ? (
          <EmptyState
            icon={ShieldCheck}
            title="All clear"
            description="No reports or posts waiting for you."
          />
        ) : (
          <div className="space-y-4">
            {queue.pending_posts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Waiting for approval
                </h3>
                {queue.pending_posts.map((post) => (
                  <PendingPostCard
                    key={post.id}
                    post={post}
                    onAction={refresh}
                  />
                ))}
              </div>
            )}
            {queue.reports.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Reports
                </h3>
                {queue.reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onAction={refresh}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
    </PageState>
  );
}
