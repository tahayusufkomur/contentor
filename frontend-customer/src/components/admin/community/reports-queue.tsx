"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [busy, setBusy] = useState(false);
  const target = report.post ?? report.comment;
  if (!target) return null;

  const act = async (action: "remove" | "keep") => {
    setBusy(true);
    try {
      await resolveReport(report.id, action);
      toast.success(action === "remove" ? "Content removed." : "Content kept.");
      onAction();
    } catch {
      toast.error("Couldn't resolve the report.");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="destructive">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
          <span className="text-muted-foreground">
            Reported by {report.reporter.display_name} · {timeAgo(report.created_at)}
          </span>
        </div>
        {report.detail && (
          <p className="text-sm italic text-muted-foreground">“{report.detail}”</p>
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
            disabled={busy}
            onClick={() => void act("remove")}
          >
            Remove
          </Button>
          <Button
            variant="outline"
            size="sm"
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

  if (!queue) return <Skeleton className="h-48 w-full" />;

  const empty = queue.reports.length === 0 && queue.pending_posts.length === 0;
  if (empty) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="All clear"
        description="No reports or posts waiting for you."
      />
    );
  }

  return (
    <div className="space-y-4">
      {queue.pending_posts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Waiting for approval
          </h3>
          {queue.pending_posts.map((post) => (
            <Card key={post.id}>
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
                    onClick={async () => {
                      await approvePost(post.id);
                      toast.success("Post approved.");
                      refresh();
                    }}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await removePost(post.id);
                      toast.success("Post removed.");
                      refresh();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {queue.reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Reports</h3>
          {queue.reports.map((report) => (
            <ReportCard key={report.id} report={report} onAction={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
