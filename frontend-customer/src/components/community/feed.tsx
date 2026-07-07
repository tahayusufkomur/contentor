"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getFeed } from "@/lib/community";
import type { CommunityMe, CommunityPost } from "@/types/community";
import { Composer } from "./composer";
import { PostCard, type ModeratorHooks } from "./post-card";

export function Feed({
  me,
  moderator,
}: {
  me: CommunityMe;
  moderator: ModeratorHooks | null;
}) {
  const [pinned, setPinned] = useState<CommunityPost[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [welcome, setWelcome] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getFeed();
      setPinned(page.pinned ?? []);
      setPosts(page.results);
      setWelcome(page.welcome_message ?? "");
      setNext(page.next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!next) return;
    const page = await getFeed(next);
    setPosts((prev) => [...prev, ...page.results]);
    setNext(page.next);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {welcome && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          {welcome}
        </div>
      )}
      <Composer onPosted={() => void loadFirst()} />
      {pinned.map((post) => (
        <PostCard
          key={`pin-${post.id}`}
          post={post}
          me={me}
          onChanged={() => void loadFirst()}
          moderator={moderator}
        />
      ))}
      {posts.length === 0 && pinned.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="Be the first to post"
          description="Say hi and get the conversation going. 👋"
        />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            me={me}
            onChanged={() => void loadFirst()}
            moderator={moderator}
          />
        ))
      )}
      {next && (
        <Button variant="outline" className="w-full" onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
