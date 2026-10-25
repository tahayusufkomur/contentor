"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download, Film, ImageDown, Trash2 } from "lucide-react";
import { ReelPreview } from "@/components/admin/reels/reel-preview";
import {
  CaptionFields,
  CoverFields,
  ExtrasFields,
  FramingFields,
  PostFields,
  Section,
} from "@/components/admin/reels/reel-fields";
import { useReel } from "@/components/admin/reels/use-reel";
import { CoverFonts } from "@/components/reels/reel-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";
import { plainHook } from "@/lib/reels/cover";
import { clock, reelLength, type Span } from "@/lib/reels/timeline";
import type { ReelDetail } from "@/types/reels";

export const BOLD_FONT =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap";

/** One reel: its live preview, and everything about it the coach can change — its cover (the hook, the
 *  design, the frame), where it starts and ends, the caption style and language, the framing, the extras and
 *  the post's text — each change saved at once. Making the video file is one button; the file and its cover
 *  download once they are ready. Cutting it by hand happens in the video studio. */
export function ReelEditor({ initial }: { initial: ReelDetail }) {
  const t = useTranslations("admin.reels.editor");
  const tr = useTranslations("admin.reels");
  const editing = useReel(initial);
  const {
    reel,
    live,
    saving,
    change,
    make,
    starting,
    download,
    fetching,
    downloadCover,
    fetchingCover,
    remove,
    deleting,
  } = editing;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nudge = (edge: "start" | "end", by: number) => {
    const at = Math.max(0, +(reel[edge] + by).toFixed(2));
    change(edge === "start" ? { start: at } : { end: at });
  };
  const length = reelLength(reel.keep as Span[]);
  const ready = reel.status === "ready" && !reel.stale;

  return (
    <div className="space-y-6">
      <CoverFonts look={reel.brand.look} />
      <link rel="stylesheet" href={BOLD_FONT} />

      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <NavLink
            href={`/admin/reels?video=${reel.video}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("back")}
          </NavLink>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {plainHook(live.title) || tr("untitled")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("from", { video: reel.video_title })} · {clock(reel.start)}–
            {clock(reel.end)} · {t("length", { length: clock(length) })}
            {saving ? ` · ${t("saving")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex gap-2">
            <Button asChild variant="outline" className="gap-2">
              <NavLink href={`/admin/video-studio/${reel.id}`}>
                <Film className="h-4 w-4" />
                {t("openStudio")}
              </NavLink>
            </Button>
            {ready && reel.cover_file ? (
              <Button
                variant="outline"
                onClick={() => downloadCover()}
                loading={fetchingCover}
                className="gap-2"
              >
                <ImageDown className="h-4 w-4" />
                {t("downloadCover")}
              </Button>
            ) : null}
            {ready ? (
              <Button
                onClick={() => download()}
                loading={fetching}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t("download")}
              </Button>
            ) : (
              <Button
                onClick={() => make()}
                loading={starting || reel.status === "rendering"}
                loadingText={t("making")}
                disabled={!reel.render || saving}
              >
                {reel.status === "failed"
                  ? t("tryAgain")
                  : reel.stale
                    ? t("makeAgain")
                    : t("make")}
              </Button>
            )}
          </div>
          <p
            className="text-xs text-muted-foreground sm:text-right"
            aria-live="polite"
          >
            <MakeHint reel={reel} />
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <ReelPreview reel={live} />
          {reel.file_url && reel.status === "ready" ? (
            <details className="mx-auto max-w-[340px] text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("theFile")}
              </summary>
              <video
                src={reel.file_url}
                controls
                playsInline
                preload="none"
                className="mt-2 aspect-[9/16] w-full rounded-xl bg-black"
              />
            </details>
          ) : null}
        </div>

        <div className="min-w-0 space-y-8">
          <Section title={t("cover")} hint={t("coverHint")}>
            <CoverFields editing={editing} />
          </Section>

          <Section title={t("clip")} hint={t("clipHint")}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("start")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => nudge("start", -1)}
              >
                −1s
              </Button>
              <span className="w-12 text-center tabular-nums">
                {clock(reel.start)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => nudge("start", 1)}
              >
                +1s
              </Button>
              <span className="ml-3 text-muted-foreground">{t("end")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => nudge("end", -1)}
              >
                −1s
              </Button>
              <span className="w-12 text-center tabular-nums">
                {clock(reel.end)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => nudge("end", 1)}
              >
                +1s
              </Button>
            </div>
            <p className="max-h-56 overflow-y-auto rounded-lg border p-3 text-sm leading-7">
              {reel.words.map(([start, end, text], i) => {
                const inside = end > reel.start && start < reel.end;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      change(
                        start < (reel.start + reel.end) / 2
                          ? { start: Math.max(0, +(start - 0.1).toFixed(2)) }
                          : { end: +(end + 0.25).toFixed(2) },
                      )
                    }
                    className={cn(
                      "rounded px-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      inside
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {text.trim()}
                  </button>
                );
              })}
            </p>
          </Section>

          <Section title={t("captions")}>
            <CaptionFields editing={editing} />
          </Section>

          <Section title={t("framing")}>
            <FramingFields editing={editing} />
          </Section>

          <Section title={t("extras")}>
            <ExtrasFields editing={editing} />
          </Section>

          <Section title={t("post")} hint={t("postHint")}>
            <PostFields editing={editing} />
          </Section>

          <div className="flex items-center gap-2 border-t pt-5">
            {confirmDelete ? (
              <>
                <span className="text-sm">{t("deleteSure")}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => remove()}
                  loading={deleting}
                >
                  {t("delete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("keep")}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </Button>
            )}
            {reel.made_by === "marketing" ? (
              <Badge variant="secondary" className="ml-auto">
                {t("madeByTeam")}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where making the reel's video stands, in a line. */
export function MakeHint({ reel }: { reel: ReelDetail }) {
  const t = useTranslations("admin.reels.editor");
  const ready = reel.status === "ready" && !reel.stale;
  return (
    <>
      {!reel.render
        ? t("noRender")
        : reel.status === "rendering"
          ? t("makingHint")
          : reel.stale
            ? t("staleHint")
            : reel.status === "failed"
              ? reel.error
              : ready
                ? t("readyHint")
                : t("makeHint")}
    </>
  );
}
