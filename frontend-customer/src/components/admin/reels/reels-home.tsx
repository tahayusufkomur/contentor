"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clapperboard, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@shared/hooks/async-runner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { CoverFonts, ReelCover } from "@/components/reels/reel-cover";
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
import { StaleContainer } from "@/components/ui/stale-container";
import {
  deleteReel,
  getReelVideos,
  getSearch,
  listIdeas,
  listReels,
  pickIdea,
  startSearch,
} from "@/lib/reels-api";
import { clock } from "@/lib/reels/timeline";
import type {
  CoverBrand,
  ReelSearch,
  ReelStatus,
  ReelSummary,
  ReelVideos,
} from "@/types/reels";

const RUNNING = new Set(["transcribing", "picking", "framing", "covering"]);
const FIRST = 5; // ideas a first search asks for (a new video's are found ahead, backend jobs.AHEAD)
const MORE = 3; // and a "find more"
const POLL_MS = 3000;
const STATUS_BADGE: Record<ReelStatus, BadgeProps["variant"]> = {
  idea: "outline",
  draft: "outline",
  rendering: "accent",
  ready: "success",
  failed: "destructive",
};

/** The page while it loads, in the shape it will take. */
export function ReelsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 rounded-xl" />
      <SkeletonCardGrid count={4} className="grid-cols-2 lg:grid-cols-4" />
    </div>
  );
}

/** The reels studio's front page. Every video the coach uploads is searched ahead of her for the moments that
 *  can travel, each found as an idea with its cover already designed: she picks a video, sees its ideas and
 *  uses the ones she likes (or asks for more). Below, the reels she is working on, by video. */
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
  const [searches, setSearches] = useState<Record<number, ReelSearch>>({});
  const [ideas, setIdeas] = useState<ReelSummary[]>([]);
  const [ideasFor, setIdeasFor] = useState<number | null>(null);
  const [ideasKey, setIdeasKey] = useState(0);

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
            found.videos.find((v) => v.ideas > 0)?.id ??
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

  // The picked video's ideas: the ones shown stay, dimmed, while another video's load.
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    listIdeas(picked)
      .then((found) => {
        if (cancelled) return;
        setIdeas(found);
        setIdeasFor(picked);
      })
      .catch((err) => !cancelled && toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [picked, ideasKey]);

  // Follow every search still running; when one ends, its ideas load.
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
              setIdeasKey((k) => k + 1);
            } else if (s.status === "failed")
              toast.error(s.detail || t("failed"));
          })
          .catch(() => undefined),
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, t]);

  const selected = videos?.videos.find((v) => v.id === picked);
  const search = picked ? searches[picked] : undefined;
  const busy = !!search && RUNNING.has(search.status);
  const shown = ideasFor === picked ? ideas : [];

  const { run: findMore, loading: starting } = useAsyncAction(async () => {
    if (!picked) return;
    const state = await startSearch(picked, shown.length ? MORE : FIRST);
    setSearches((m) => ({ ...m, [picked]: state }));
  });

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
      ) : videos ? (
        <div className="space-y-10">
          <CoverFonts look={videos.brand.look} />
          <section className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <h2 className="font-semibold">{t("ideas.title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("ideas.description")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 space-y-1.5 sm:w-72">
                  <Label htmlFor="reels-video">{t("make.video")}</Label>
                  <Select
                    value={picked ? String(picked) : undefined}
                    onValueChange={(v) => setPicked(Number(v))}
                  >
                    <SelectTrigger id="reels-video" className="w-full">
                      <SelectValue placeholder={t("make.pick")} />
                    </SelectTrigger>
                    <SelectContent>
                      {videos.videos.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.title}
                          {v.duration ? ` · ${clock(v.duration)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant={shown.length ? "outline" : "default"}
                  onClick={() => findMore()}
                  loading={starting || busy}
                  loadingText={
                    busy ? t(`search.${search!.status}`) : t("make.starting")
                  }
                  disabled={!selected || selected.words === "unavailable"}
                >
                  {shown.length ? t("ideas.more") : t("ideas.find")}
                </Button>
              </div>
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
            {!videos.render ? (
              <p className="text-sm text-muted-foreground">
                {t("make.noRender")}
              </p>
            ) : null}

            <StaleContainer pending={ideasFor !== picked}>
              {shown.length ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {shown.map((idea) => (
                    <li key={idea.id}>
                      <IdeaCard
                        idea={idea}
                        brand={videos.brand}
                        onUsed={() => navigate(`/admin/reels/${idea.id}`)}
                        onDismissed={() =>
                          setIdeas((list) =>
                            list.filter((i) => i.id !== idea.id),
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : !busy && selected?.words !== "unavailable" ? (
                <p className="text-sm text-muted-foreground">
                  {t("ideas.none")}
                </p>
              ) : null}
            </StaleContainer>
          </section>

          <section className="space-y-5 border-t pt-8">
            <h2 className="font-semibold">{t("yours")}</h2>
            {byVideo.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("none")}</p>
            ) : (
              byVideo.map(([id, row]) => (
                <div key={id} className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {row.title}
                  </h3>
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {row.reels.map((reel) => (
                      <li key={reel.id}>
                        <ReelCard reel={reel} brand={videos.brand} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}
    </PageState>
  );
}

/** An idea: its cover as it will open the reel, what kind of moment it is and why it works; use it or let
 *  it go. */
function IdeaCard({
  idea,
  brand,
  onUsed,
  onDismissed,
}: {
  idea: ReelSummary;
  brand: CoverBrand;
  onUsed: () => void;
  onDismissed: () => void;
}) {
  const t = useTranslations("admin.reels");
  const { run: use, loading: using } = useAsyncAction(async () => {
    await pickIdea(idea.id);
    onUsed();
  });
  const { run: dismiss, loading: dismissing } = useAsyncAction(async () => {
    await deleteReel(idea.id);
    toast.success(t("ideas.dismissed"));
    onDismissed();
  });
  return (
    <article className="space-y-2.5" aria-label={t("ideas.label")}>
      <div className="relative">
        <ReelCover
          cover={idea.cover}
          brand={brand}
          className="rounded-lg shadow-sm"
        />
        <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs tabular-nums">
          {clock(idea.end - idea.start)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {idea.kind ? (
          <Badge variant="secondary">{t(`kinds.${idea.kind}`)}</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {t("score", { score: idea.score })}
        </span>
      </div>
      {idea.why ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">{idea.why}</p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => use()}
          loading={using}
          loadingText={t("ideas.using")}
        >
          {t("ideas.use")}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => dismiss()}
          loading={dismissing}
          aria-label={t("ideas.dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

/** A reel as its cover, its length and where it stands; it opens in the reel editor (or `href`). */
export function ReelCard({
  reel,
  brand,
  href,
}: {
  reel: ReelSummary;
  brand: CoverBrand;
  href?: string;
}) {
  const t = useTranslations("admin.reels");
  const state = reel.stale ? "changed" : reel.status;
  return (
    <NavLink
      href={href ?? `/admin/reels/${reel.id}`}
      className="group block space-y-2 rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="relative transition-opacity group-hover:opacity-90">
        <ReelCover cover={reel.cover} brand={brand} className="rounded-lg" />
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
