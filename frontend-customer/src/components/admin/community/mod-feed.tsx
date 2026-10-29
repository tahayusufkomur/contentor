"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
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
  const t = useTranslations("admin.community.modFeed");
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    getCommunityMe()
      .then((result) => {
        setMe(result);
        setStatus("ready");
      })
      .catch(() => {
        toast.error(t("enableFirst"));
        setStatus("error");
      });
  }, [t]);

  if (status === "loading") return <Skeleton className="h-64 w-full" />;

  if (status === "error" || !me) {
    return (
      <EmptyState
        icon={Users}
        title={t("offTitle")}
        description={t("offHint")}
      />
    );
  }

  const refresh = () => setFeedKey((k) => k + 1);

  const hooks: ModeratorHooks = {
    pin: async (post) => {
      await pinPost(post.id);
      toast.success(t("pinned"));
      refresh();
    },
    unpin: async (post) => {
      await unpinPost(post.id);
      refresh();
    },
    remove: async (post) => {
      if (!window.confirm(t("confirmRemovePost"))) return;
      await removePost(post.id);
      toast.success(t("postRemoved"));
      refresh();
    },
    banAuthor: async (post) => {
      if (!window.confirm(t("confirmBan", { name: post.author.display_name })))
        return;
      await banMember(post.author.id);
      toast.success(t("banned", { name: post.author.display_name }));
      refresh();
    },
    removeComment: async (comment) => {
      if (!window.confirm(t("confirmRemoveComment"))) return;
      await removeCommentMod(comment.id);
      toast.success(t("commentRemoved"));
      refresh();
    },
  };

  return <Feed key={feedKey} me={me} moderator={hooks} />;
}
