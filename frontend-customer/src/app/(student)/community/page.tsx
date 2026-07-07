"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getCommunityMe, getCommunitySettings } from "@/lib/community";
import type { CommunityMe } from "@/types/community";
import { ApiError } from "@/types/api";

type Gate = "loading" | "disabled" | "banned" | "ok";

export default function CommunityPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [me, setMe] = useState<CommunityMe | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getCommunitySettings();
        if (!settings.is_enabled) {
          setGate("disabled");
          return;
        }
        setMe(await getCommunityMe());
        setGate("ok");
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setGate("banned");
        else setGate("disabled");
      }
    })();
  }, []);

  if (gate === "loading") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (gate === "disabled") {
    return (
      <EmptyState
        icon={Users}
        title="Community isn't available"
        description="This community hasn't been switched on yet."
      />
    );
  }
  if (gate === "banned") {
    return (
      <EmptyState
        icon={Users}
        title="You can't access the community"
        description="Your access has been removed by a moderator."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Community</h1>
      {/* Tasks 3-7 mount JoinCard + Feed here */}
      <p className="text-sm text-muted-foreground">
        Welcome, {me?.display_name}.
      </p>
    </div>
  );
}
