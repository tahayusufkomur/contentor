"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Film } from "lucide-react";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { ReelCard } from "@/components/admin/reels/reels-home";
import { VideoStudioListSkeleton } from "@/components/admin/video-studio/studio-skeleton";
import { CoverFonts } from "@/components/reels/reel-cover";
import { EmptyState } from "@/components/shared/empty-state";
import { PageState } from "@/components/ui/page-state";
import { getReelVideos, listReels } from "@/lib/reels-api";
import type { CoverBrand, ReelSummary } from "@/types/reels";

export const dynamic = "force-dynamic";

/** The video studio: every reel she has made, each opening in the editor where she cuts it by hand. */
export default function VideoStudioPage() {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const [found, setFound] = useState<{
    reels: ReelSummary[];
    brand: CoverBrand;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([listReels(), getReelVideos()])
      .then(([reels, videos]) => {
        if (!cancelled) setFound({ reels, brand: videos.brand });
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <PageState
      loading={!found && !error}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<VideoStudioListSkeleton />}
    >
      {found ? (
        <div className="space-y-6">
          <CoverFonts look={found.brand.look} />
          <div className="border-b pb-5">
            <h1 className="text-2xl font-bold tracking-tight">
              {t("nav.items.videoStudio")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reels.studio.subtitle")}
            </p>
          </div>
          {found.reels.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {found.reels.map((reel) => (
                <li key={reel.id}>
                  <ReelCard
                    reel={reel}
                    brand={found.brand}
                    href={`/admin/video-studio/${reel.id}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Film}
              title={t("reels.studio.noneTitle")}
              description={t("reels.studio.none")}
              action={{
                label: t("reels.studio.toReels"),
                onClick: () => navigate("/admin/reels"),
              }}
            />
          )}
        </div>
      ) : null}
    </PageState>
  );
}
