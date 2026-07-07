"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Feed } from "@/components/community/feed";
import type { ModeratorHooks } from "@/components/community/post-card";
import { getCommunityMe } from "@/lib/community";
import {
  banMember,
  pinPost,
  removeCommentMod,
  removePost,
  unpinPost,
} from "@/lib/community-admin";
import type { CommunityMe } from "@/types/community";

export function ModFeed() {
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    getCommunityMe()
      .then(setMe)
      .catch(() => toast.error("Enable the community in Settings first."));
  }, []);

  if (!me) return <Skeleton className="h-64 w-full" />;

  const refresh = () => setFeedKey((k) => k + 1);

  const hooks: ModeratorHooks = {
    pin: async (post) => {
      await pinPost(post.id);
      toast.success("Pinned to the top of the feed.");
      refresh();
    },
    unpin: async (post) => {
      await unpinPost(post.id);
      refresh();
    },
    remove: async (post) => {
      if (!window.confirm("Remove this post from the community?")) return;
      await removePost(post.id);
      toast.success("Post removed.");
      refresh();
    },
    banAuthor: async (post) => {
      if (
        !window.confirm(
          `Ban ${post.author.display_name} from the community? They won't be able to see or post anything.`,
        )
      )
        return;
      await banMember(post.author.id);
      toast.success(`${post.author.display_name} is banned.`);
      refresh();
    },
    removeComment: async (comment) => {
      if (!window.confirm("Remove this comment?")) return;
      await removeCommentMod(comment.id);
      toast.success("Comment removed.");
      refresh();
    },
  };

  return <Feed key={feedKey} me={me} moderator={hooks} />;
}
