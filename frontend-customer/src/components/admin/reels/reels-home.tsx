"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCardGrid } from "@/components/ui/skeletons";
import {
  getReelVideos,
  getSearch,
  listReels,
  startSearch,
} from "@/lib/reels-api";
import { clock } from "@/lib/reels/timeline";
import type {
  ReelSearch,
  ReelStatus,
  ReelSummary,
  ReelVideos,
} from "@/types/reels";

const RUNNING = new Set(["transcribing", "picking", "framing"]);
const COUNTS = [1, 2, 3, 4, 5];
const POLL_MS = 3000;
const STATUS_BADGE: Record<ReelStatus, BadgeProps["variant"]> = {
  draft: "outline",
  rendering: "accent",
  ready: "success",
  failed: "destructive",
};

/** The list while it loads, in the shape it will take. */
export function ReelsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 rounded-xl" />
      <SkeletonCardGrid count={4} className="grid-cols-2 lg:grid-cols-4" />
    </div>
  );
}

/** The reels studio's front page: pick one of the coach's videos and how many reels to find in it, then the
 *  reels found so far, by video. A search runs on the server (transcribing first if need be); the page
 *  follows it and lists its reels when it is done. */
export function ReelsHome() {
  const t = useTranslations("admin.reels");
  const navigate = useNavigate();
  const wanted = Number(useSearchParams().get("video")) || null;
  const [videos, setVideos] = useState<ReelVideos | null>(null);
  const [reels, setReels] = useState<ReelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [picked, setPicked] = useState<number | null>(wanted);
  const [count, setCount] = useState(3);
  const [searches, setSearches] = useState<Record<number, ReelSearch>>({});

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([getReelVideos(), listReels()])
      .then(([found, list]) => {
        if (cancelled) return;
        setVideos(found);
        setReels(list);
        setSearches(
          Object.fromEntries(found.videos.map((v) => [v.id, v.search])),
        );
        setPicked(
          (p) =>
            p ??
            found.videos.find((v) => v.words !== "unavailable")?.id ??
            found.videos[0]?.id ??
            null,
        );
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Follow every search still running; when one ends, the list reloads with its reels.
  const running = useMemo(
    () =>
      Object.entries(searches)
        .filter(([, s]) => RUNNING.has(s.status))
        .map(([id]) => Number(id)),
    [searches],
  );
  useEffect(() => {
    if (!running.length) return;
    const timer = setInterval(() => {
      running.forEach((id) =>
        getSearch(id)
          .then((s) => {
            setSearches((m) => ({ ...m, [id]: s }));
            if (s.status === "done") {
              toast.success(t("found", { count: s.reels.length }));
              setReloadKey((k) => k + 1);
            } else if (s.status === "failed")
              toast.error(s.detail || t("failed"));
          })
          .catch(() => undefined),
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, t]);

  const { run: find, loading: starting } = useAsyncAction(async () => {
    if (!picked) return;
    const state = await startSearch(picked, count);
    setSearches((m) => ({ ...m, [picked]: state }));
  });

  const selected = videos?.videos.find((v) => v.id === picked);
  const search = picked ? searches[picked] : undefined;
  const busy = !!search && RUNNING.has(search.status);

  const byVideo = useMemo(() => {
    const order = new Map<number, { title: string; reels: ReelSummary[] }>();
    for (const reel of reels) {
      const row = order.get(reel.video) ?? {
        title: reel.video_title,
        reels: [],
      };
      row.reels.push(reel);
      order.set(reel.video, row);
    }
    const rows = [...order.entries()];
    // the video asked for (?video=) first
    return rows.sort(([a], [b]) => Number(b === wanted) - Number(a === wanted));
  }, [reels, wanted]);

  const retry = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={retry}
      skeleton={<ReelsSkeleton />}
    >
      {videos && videos.videos.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title={t("empty.title")}
          description={t("empty.description")}
          action={{
            label: t("empty.action"),
            onClick: () => navigate("/admin/media?type=videos"),
          }}
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-4 rounded-xl border p-4 sm:p-5">
            <div>
              <h2 className="font-semibold">{t("make.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("make.description")}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="reels-video">{t("make.video")}</Label>
                <Select
                  value={picked ? String(picked) : undefined}
                  onValueChange={(v) => setPicked(Number(v))}
                >
                  <SelectTrigger id="reels-video" className="w-full">
                    <SelectValue placeholder={t("make.pick")} />
                  </SelectTrigger>
                  <SelectContent>
                    {videos?.videos.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.title}
                        {v.duration ? ` · ${clock(v.duration)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:w-36">
                <Label htmlFor="reels-count">{t("make.count")}</Label>
                <Select
                  value={String(count)}
                  onValueChange={(v) => setCount(Number(v))}
                >
                  <SelectTrigger id="reels-count" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {t("make.reels", { count: n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => find()}
                loading={starting || busy}
                loadingText={
                  busy ? t(`search.${search!.status}`) : t("make.starting")
                }
                disabled={!selected || selected.words === "unavailable"}
              >
                {t("make.action")}
              </Button>
            </div>
            {selected?.words === "unavailable" ? (
              <p className="text-sm text-muted-foreground">
                {t("make.unavailable")}
              </p>
            ) : selected?.words === "failed" ? (
              <p className="text-sm text-muted-foreground">
                {t("make.noSpeech")}
              </p>
            ) : busy ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t(`search.${search!.status}Hint`)}
              </p>
            ) : search?.status === "failed" && search.detail ? (
              <p className="text-sm text-destructive">{search.detail}</p>
            ) : null}
            {videos && !videos.render ? (
              <p className="text-sm text-muted-foreground">
                {t("make.noRender")}
              </p>
            ) : null}
          </section>

          {byVideo.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            byVideo.map(([id, row]) => (
              <section key={id} className="space-y-3">
                <h2 className="font-semibold">{row.title}</h2>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {row.reels.map((reel) => (
                    <li key={reel.id}>
                      <ReelCard reel={reel} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </PageState>
  );
}

function ReelCard({ reel }: { reel: ReelSummary }) {
  const t = useTranslations("admin.reels");
  const state = reel.stale ? "changed" : reel.status;
  return (
    <NavLink
      href={`/admin/reels/${reel.id}`}
      className="group block space-y-2 rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-muted to-secondary p-4 text-center transition-colors group-hover:from-accent/40">
        <p className="line-clamp-5 text-sm font-semibold leading-snug">
          {reel.title || t("untitled")}
        </p>
        <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs tabular-nums">
          {clock(reel.file?.duration || reel.end - reel.start)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant={reel.stale ? "warning" : STATUS_BADGE[reel.status]}>
          {t(`status.${state}`)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t("score", { score: reel.score })}
        </span>
      </div>
    </NavLink>
  );
}
