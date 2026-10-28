"use client";

import { useState } from "react";
import { MoreHorizontal, Pin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, updatePost } from "@/lib/community";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type {
  CommunityComment,
  CommunityMe,
  CommunityPost,
} from "@/types/community";
import { CommentSection } from "./comment-section";
import { ImageGrid } from "./image-grid";
import { Linkify } from "./linkify";
import { ReactionBar } from "./reaction-bar";
import { ReportDialog } from "./report-dialog";
import { useLocale, useTranslations } from "next-intl";

export interface ModeratorHooks {
  pin: (post: CommunityPost) => Promise<void>;
  unpin: (post: CommunityPost) => Promise<void>;
  remove: (post: CommunityPost) => Promise<void>;
  banAuthor: (post: CommunityPost) => Promise<void>;
  removeComment: (comment: CommunityComment) => Promise<void>;
}

type CommonT = ReturnType<typeof useTranslations<"common">>;

export function timeAgo(iso: string, locale: string, t: CommonT): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("community.justNow");
  if (s < 3600) return t("community.minutes", { count: Math.floor(s / 60) });
  if (s < 86400) return t("community.hours", { count: Math.floor(s / 3600) });
  if (s < 604800) return t("community.days", { count: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString(locale);
}

export function PostCard({
  post,
  me,
  onChanged,
  moderator,
}: {
  post: CommunityPost;
  me: CommunityMe;
  onChanged: () => void;
  moderator: ModeratorHooks | null;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isMine = post.author.id === me.id;

  const { run: saveEdit, loading: saving } = useAsyncAction(
    async () => {
      await updatePost(post.id, draft.trim());
      setEditing(false);
      onChanged();
    },
    { errorToast: t("community.saveEditError") },
  );

  const { run: removeOwn, loading: removing } = useAsyncAction(
    async () => {
      if (!window.confirm(t("community.confirmDelete"))) return;
      await deletePost(post.id);
      onChanged();
    },
    { errorToast: t("community.deletePostError") },
  );

  return (
    <Card data-testid="post-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author.avatar} alt="" />
            <AvatarFallback>
              {post.author.display_name.slice(0, 2).toLocaleUpperCase(locale)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{post.author.display_name}</span>
              {post.author.is_coach && (
                <Badge variant="secondary">{t("community.creator")}</Badge>
              )}
              {post.is_pinned && (
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {post.edited_at
                  ? t("community.timeEdited", {
                      time: timeAgo(post.created_at, locale, t),
                    })
                  : timeAgo(post.created_at, locale, t)}
              </span>
              {post.status === "pending" && (
                <Badge variant="outline">
                  {t("community.awaitingApproval")}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("community.postActions")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isMine && (
                <>
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    {t("actions.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    disabled={removing}
                    onClick={removeOwn}
                  >
                    {t("actions.delete")}
                  </DropdownMenuItem>
                </>
              )}
              {!isMine && (
                <DropdownMenuItem onClick={() => setReporting(true)}>
                  {t("community.report")}
                </DropdownMenuItem>
              )}
              {moderator && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      post.is_pinned
                        ? moderator.unpin(post)
                        : moderator.pin(post)
                    }
                  >
                    {post.is_pinned ? t("community.unpin") : t("community.pin")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.remove(post)}
                  >
                    {t("community.removePost")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.banAuthor(post)}
                  >
                    {t("community.banMember")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={10000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={!draft.trim()}
                loading={saving}
                loadingText={t("community.saving")}
              >
                {t("actions.save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(post.body);
                  setEditing(false);
                }}
              >
                {t("actions.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <Linkify text={post.body} />
          </div>
        )}

        <ImageGrid images={post.images} />

        <div className="flex items-center gap-4">
          <ReactionBar
            kind="posts"
            id={post.id}
            count={post.reaction_count}
            mine={post.my_reaction}
          />
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowComments((v) => !v)}
          >
            💬 {post.comment_count}
          </button>
        </div>

        {showComments && (
          <CommentSection post={post} me={me} moderator={moderator} />
        )}

        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          kind="posts"
          id={post.id}
        />
      </CardContent>
    </Card>
  );
}
