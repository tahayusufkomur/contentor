"use client";

import { useState } from "react";
import { MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
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

export interface ModeratorHooks {
  pin: (post: CommunityPost) => Promise<void>;
  unpin: (post: CommunityPost) => Promise<void>;
  remove: (post: CommunityPost) => Promise<void>;
  banAuthor: (post: CommunityPost) => Promise<void>;
  removeComment: (comment: CommunityComment) => Promise<void>;
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isMine = post.author.id === me.id;

  const saveEdit = async () => {
    try {
      await updatePost(post.id, draft.trim());
      setEditing(false);
      onChanged();
    } catch {
      toast.error("Couldn't save the edit.");
    }
  };

  const removeOwn = async () => {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    try {
      await deletePost(post.id);
      onChanged();
    } catch {
      toast.error("Couldn't delete the post.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author.avatar} alt="" />
            <AvatarFallback>
              {post.author.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{post.author.display_name}</span>
              {post.author.is_coach && <Badge variant="secondary">Coach</Badge>}
              {post.is_pinned && (
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {timeAgo(post.created_at)}
                {post.edited_at ? " · edited" : ""}
              </span>
              {post.status === "pending" && (
                <Badge variant="outline">Awaiting approval</Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Post actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isMine && (
                <>
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={removeOwn}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!isMine && (
                <DropdownMenuItem onClick={() => setReporting(true)}>
                  Report
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
                    {post.is_pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.remove(post)}
                  >
                    Remove post
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.banAuthor(post)}
                  >
                    Ban member
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
              <Button size="sm" onClick={saveEdit} disabled={!draft.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(post.body);
                  setEditing(false);
                }}
              >
                Cancel
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
