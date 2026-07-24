"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addComment, deleteComment, getComments } from "@/lib/community";
import type {
  CommunityComment,
  CommunityMe,
  CommunityPost,
} from "@/types/community";
import { Linkify } from "./linkify";
import { type ModeratorHooks, timeAgo } from "./post-card";
import { ReactionBar } from "./reaction-bar";
import { ReportDialog } from "./report-dialog";
import { useAsyncAction } from "@shared/hooks/use-async-action";

export function CommentSection({
  post,
  me,
  moderator,
}: {
  post: CommunityPost;
  me: CommunityMe;
  moderator: ModeratorHooks | null;
}) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [reportingId, setReportingId] = useState<number | null>(null);

  const load = async (p: number) => {
    const data = await getComments(post.id, p);
    setComments((prev) =>
      p === 1 ? data.results : [...prev, ...data.results],
    );
    setHasMore(Boolean(data.next));
    setPage(p);
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const { run: submit, loading: busy } = useAsyncAction(
    async () => {
      if (!draft.trim()) return;
      const comment = await addComment(post.id, draft.trim());
      setComments((prev) => [...prev, comment]);
      setDraft("");
    },
    { errorToast: "Couldn't add your comment." },
  );

  return (
    <div className="space-y-3 border-t pt-3">
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          me={me}
          moderator={moderator}
          onDeleted={(id) =>
            setComments((prev) => prev.filter((c) => c.id !== id))
          }
          onReport={setReportingId}
        />
      ))}
      {hasMore && (
        <Button variant="ghost" size="sm" onClick={() => void load(page + 1)}>
          Show more comments
        </Button>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Write a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          size="sm"
          onClick={submit}
          loading={busy}
          disabled={!draft.trim()}
        >
          Reply
        </Button>
      </div>

      <ReportDialog
        open={reportingId !== null}
        onClose={() => setReportingId(null)}
        kind="comments"
        id={reportingId ?? 0}
      />
    </div>
  );
}

function CommentRow({
  comment,
  me,
  moderator,
  onDeleted,
  onReport,
}: {
  comment: CommunityComment;
  me: CommunityMe;
  moderator: ModeratorHooks | null;
  onDeleted: (id: number) => void;
  onReport: (id: number) => void;
}) {
  const { run: removeOwn } = useAsyncAction(
    async () => {
      await deleteComment(comment.id);
      onDeleted(comment.id);
    },
    { errorToast: "Couldn't delete the comment." },
  );

  return (
    <div className="flex items-start gap-2.5">
      <Avatar className="h-7 w-7">
        <AvatarImage src={comment.author.avatar} alt="" />
        <AvatarFallback>
          {comment.author.display_name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{comment.author.display_name}</span>
          {comment.author.is_coach && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              Coach
            </Badge>
          )}
          <span className="text-muted-foreground">
            {timeAgo(comment.created_at)}
          </span>
        </div>
        <div className="mt-0.5 text-sm">
          <Linkify text={comment.body} />
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <ReactionBar
            kind="comments"
            id={comment.id}
            count={comment.reaction_count}
            mine={comment.my_reaction}
          />
          {comment.author.id === me.id && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => void removeOwn()}
              aria-label="Delete comment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {comment.author.id !== me.id && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onReport(comment.id)}
            >
              Report
            </button>
          )}
          {moderator && comment.author.id !== me.id && (
            <button
              type="button"
              className="text-xs text-destructive"
              onClick={() => void moderator.removeComment(comment)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
