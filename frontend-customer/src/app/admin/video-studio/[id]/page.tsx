"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VideoStudioSkeleton } from "@/components/admin/video-studio/studio-skeleton";
import { VideoStudio } from "@/components/admin/video-studio/video-studio";
import { PageState } from "@/components/ui/page-state";
import { getReel } from "@/lib/reels-api";
import type { ReelDetail } from "@/types/reels";

export const dynamic = "force-dynamic";

/** One reel in the video studio. */
export default function VideoStudioReelPage() {
  const { id } = useParams<{ id: string }>();
  const [reel, setReel] = useState<ReelDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReel(null);
    getReel(id)
      .then((found) => !cancelled && setReel(found))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  return (
    <PageState
      loading={!reel && !error}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<VideoStudioSkeleton />}
      className="lg:h-full"
    >
      {reel ? <VideoStudio key={reel.id} initial={reel} /> : null}
    </PageState>
  );
}
