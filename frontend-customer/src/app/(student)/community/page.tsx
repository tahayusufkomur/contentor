"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Feed } from "@/components/community/feed";
import { JoinCard } from "@/components/community/join-card";
import { getCommunityMe, getCommunitySettings } from "@/lib/community";
import { isTransientApiError, retryTransient } from "@/lib/api-client";
import type { CommunityMe } from "@/types/community";
import { ApiError } from "@/types/api";

type Gate = "loading" | "disabled" | "banned" | "error" | "ok";

export default function CommunityPage() {
  const t = useTranslations("student.communityPage");
  const [gate, setGate] = useState<Gate>("loading");
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [joined, setJoined] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false; // Try-again re-runs this while a run may be pending
    (async () => {
      try {
        const settings = await retryTransient(getCommunitySettings);
        if (cancelled) return;
        if (!settings.is_enabled) {
          setGate("disabled");
          return;
        }
        const loadedMe = await retryTransient(getCommunityMe);
        if (cancelled) return;
        setMe(loadedMe);
        setGate("ok");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setGate("banned");
        // A rate-limit or server blip must not render as the deliberate
        // "switched off" state — that told throttled visitors of an enabled
        // community that it doesn't exist.
        else if (isTransientApiError(err)) setGate("error");
        else setGate("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

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
        title={t("disabledTitle")}
        description={t("disabledText")}
      />
    );
  }
  if (gate === "banned") {
    return (
      <EmptyState
        icon={Users}
        title={t("bannedTitle")}
        description={t("bannedText")}
      />
    );
  }
  if (gate === "error") {
    return (
      <EmptyState
        icon={Users}
        title={t("errorTitle")}
        description={t("errorText")}
        action={{
          label: t("tryAgain"),
          onClick: () => {
            setGate("loading");
            setAttempt((n) => n + 1);
          },
        }}
      />
    );
  }

  const needsJoin = !joined && !localStorage.getItem("community_joined");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {needsJoin && me ? (
        <JoinCard
          me={me}
          onDone={(updated) => {
            setMe(updated);
            setJoined(true);
          }}
        />
      ) : (
        me && <Feed me={me} moderator={null} />
      )}
    </div>
  );
}
