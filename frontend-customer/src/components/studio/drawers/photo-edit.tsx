"use client";

// The Edit photo drawer: what she does to the cover's photo itself. Filters (the looks' photo grades, her
// site's own first, and two duotones in her colours), warmth and blur, the shape of its frame, and the
// photo tools: its background removed, the photo extended to the shape she is designing, something taken
// out of it or changed in it. Those make a new photo in her Media (photo_edits.py on the backend) and put
// it on the cover; Undo brings the old one back, and the original stays in her Media either way.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Eraser, Expand, Scissors, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { CoverArt, PHOTO_MASKS } from "@/components/covers/cover-art";
import type {
  PickedPhoto,
  PickOptions,
} from "@/components/studio/photo-sources";
import { Section } from "@/components/studio/simple-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EditorAction } from "@/lib/covers/editor";
import { followJob } from "@/lib/covers/generate";
import { RANGES, sizeAspect } from "@/lib/covers/recipe";
import { whileBusy } from "@/lib/covers/work";
import {
  photoJobStatus,
  startCutout,
  startPhotoEdit,
  type PhotoEdit,
} from "@/lib/photo-edits-api";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import { GRADES, MASKS } from "@/types/design";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  Grade,
} from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { CoverAspect } from "@shared/sections/types";

export interface PhotoEditDrawerProps {
  recipe: CoverRecipe;
  /** The cover as drawn now: the filter tiles are drawn from it. */
  cover: CoverDesign;
  item: CoverItem;
  /** The size on the canvas: "Extend to fit" grows the photo to its shape. */
  size: CoverSize;
  cardAspect: CoverAspect;
  edit: (action: EditorAction) => void;
  /** The image model can change photos (the server has its key). */
  photoAi: boolean;
  /** The background remover is there. */
  cutout: boolean;
  /** New photos she can still make this month: an edit by the image model is one of them. */
  generationsLeft: number;
  onGenerationStart?: () => void;
  onUsedUp?: () => void;
  onPick: (photo: PickedPhoto, options?: PickOptions) => void;
  onGenerating?: (generating: boolean) => void;
  onBusy?: (busy: boolean) => void;
}

/** One filter, drawn on her photo the way the cover would draw it: a tile under 180 px shows the photo alone. */
function FilterTile({
  cover,
  item,
  grade,
  on,
  label,
  onPick,
}: {
  cover: CoverDesign;
  item: CoverItem;
  grade: Grade;
  on: boolean;
  label: string;
  onPick: () => void;
}) {
  const recipe = cover.recipe;
  const design: CoverDesign = {
    ...cover,
    recipe: {
      ...recipe,
      layout: "photo",
      photo: { ...recipe.photo, grade, zoom: 1, mask: "none" },
    },
  };
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onPick}
        className="group block w-full space-y-1 rounded-md text-left text-[11px] leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <span
          className={cn(
            "relative block aspect-square overflow-hidden rounded-md bg-muted ring-offset-2 ring-offset-background group-hover:ring-2 group-hover:ring-ring",
            on && "ring-2 ring-foreground",
          )}
        >
          <CoverArt design={design} item={item} />
        </span>
        <span className="block truncate">{label}</span>
      </button>
    </li>
  );
}

function Slider({
  label,
  low,
  high,
  range,
  step,
  value,
  onChange,
}: {
  label: string;
  /** What each end of the slider means. */
  low: string;
  high: string;
  range: readonly [number, number];
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-foreground"
      />
      <span
        aria-hidden="true"
        className="flex justify-between text-[11px] text-muted-foreground"
      >
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </div>
  );
}

/** A tool that makes a new photo: its button, what it costs, and, for one that is told what to do, a field. */
function PhotoTool({
  icon,
  label,
  hint,
  busy,
  disabled,
  field,
  onRun,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  /** The field's label and example; none for a tool that needs no words. */
  field?: { label: string; placeholder: string };
  onRun: (words: string) => void;
}) {
  const id = useId();
  const [words, setWords] = useState("");
  return (
    <form
      className="space-y-1.5 rounded-lg border bg-background p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!field || words.trim()) onRun(words.trim());
      }}
    >
      {field && (
        <>
          <label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </label>
          <Input
            id={id}
            value={words}
            maxLength={200}
            disabled={disabled}
            placeholder={field.placeholder}
            className="h-9 text-xs"
            onChange={(e) => setWords(e.target.value)}
          />
        </>
      )}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="w-full justify-start gap-2"
        loading={busy}
        disabled={disabled || (field !== undefined && !words.trim())}
      >
        {icon}
        {label}
      </Button>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </form>
  );
}

type Tool = "cutout" | "expand" | "erase" | "change";

export function PhotoEditDrawer({
  recipe,
  cover,
  item,
  size,
  cardAspect,
  edit,
  photoAi,
  cutout,
  generationsLeft,
  onGenerationStart,
  onUsedUp,
  onPick,
  onGenerating,
  onBusy,
}: PhotoEditDrawerProps) {
  const t = useTranslations("admin.studio.drawers.photo");
  const ts = useTranslations("admin.studio.size");
  const { photo } = recipe;
  const hasPhoto = Boolean(photo.id && cover.photos[photo.id]);
  const adjust = (patch: Partial<CoverRecipe["photo"]>) =>
    edit({ type: "photoAdjust", patch });
  const [running, setRunning] = useState<Tool | null>(null);
  const asking = useRef<AbortController | null>(null);
  // Leaving the editor stops the asking; a photo already being made is paid for either way.
  useEffect(() => () => asking.current?.abort(), []);

  const { run } = useAsyncAction(
    (tool: Tool, words: string) =>
      whileBusy(onBusy, async () => {
        const photoId = photo.id;
        if (!photoId) return;
        const controller = (asking.current = new AbortController());
        const job: PhotoEdit | null =
          tool === "expand"
            ? { mode: "expand", aspect: sizeAspect(size, cardAspect) }
            : tool === "erase" || tool === "change"
              ? { mode: tool, instruction: words }
              : null;
        setRunning(tool);
        onGenerating?.(true);
        try {
          const made = await followJob(
            () => (job ? startPhotoEdit(photoId, job) : startCutout(photoId)),
            photoJobStatus,
            // the background remover is free; the others are one of the month's new photos
            {
              signal: controller.signal,
              onStart: job ? onGenerationStart : undefined,
            },
          );
          if (controller.signal.aborted) return;
          if (!made?.signed_url) throw new Error("The job made no photo");
          onPick(
            { id: made.id, url: made.signed_url },
            tool === "cutout"
              ? // she stands at the bottom right, clear of the words at the left
                { layout: "cutout", focus: [1, 1] }
              : { keep: tool === "erase" || tool === "change" },
          );
        } finally {
          setRunning(null);
          onGenerating?.(false);
        }
      }),
    {
      onError: (error) => {
        if (asking.current?.signal.aborted) return;
        const usedUp = error instanceof ApiError && error.status === 429;
        if (usedUp) onUsedUp?.();
        toast.error(usedUp ? t("usedUp") : t("failed"));
      },
    },
  );

  const busy = running !== null;
  const left = generationsLeft > 0;
  const paidHint = left ? t("costs", { count: generationsLeft }) : t("usedUp");

  return (
    <div className="space-y-6">
      {!hasPhoto && (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {hasPhoto && (
        <>
          <Section title={t("filters")}>
            <ul className="grid grid-cols-3 gap-2">
              {GRADES.map((grade) => (
                <FilterTile
                  key={grade}
                  cover={cover}
                  item={item}
                  grade={grade}
                  on={(photo.grade ?? "none") === grade}
                  label={t(`grades.${grade}`)}
                  onPick={() =>
                    (photo.grade ?? "none") !== grade && adjust({ grade })
                  }
                />
              ))}
            </ul>
          </Section>
          <Section title={t("adjust")}>
            <Slider
              label={t("warmth")}
              low={t("cool")}
              high={t("warm")}
              range={RANGES.warmth}
              step={0.05}
              value={photo.warmth ?? 0}
              onChange={(warmth) => adjust({ warmth })}
            />
            <Slider
              label={t("blur")}
              low={t("sharp")}
              high={t("soft")}
              range={RANGES.blur}
              step={0.05}
              value={photo.blur ?? 0}
              onChange={(blur) => adjust({ blur })}
            />
          </Section>
          <Section title={t("frame")}>
            <ul className="grid grid-cols-5 gap-1.5">
              {MASKS.map((mask) => (
                <li key={mask}>
                  <button
                    type="button"
                    aria-pressed={(photo.mask ?? "none") === mask}
                    aria-label={t(`masks.${mask}`)}
                    title={t(`masks.${mask}`)}
                    onClick={() =>
                      (photo.mask ?? "none") !== mask && adjust({ mask })
                    }
                    className={cn(
                      "grid aspect-square w-full place-items-center rounded-lg border bg-background outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                      (photo.mask ?? "none") === mask &&
                        "border-foreground bg-accent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="block size-6 bg-foreground/30"
                      // (a cover's rounding is in cqmin, which a glyph outside a cover has no size for)
                      style={
                        mask === "rounded"
                          ? { borderRadius: 6 }
                          : PHOTO_MASKS[mask]
                      }
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t("tools")}>
            {cutout && (
              <PhotoTool
                icon={<Scissors aria-hidden="true" />}
                label={t("cutout")}
                hint={t("cutoutHint")}
                busy={running === "cutout"}
                disabled={busy}
                onRun={(words) => void run("cutout", words)}
              />
            )}
            {photoAi && (
              <>
                <PhotoTool
                  icon={<Expand aria-hidden="true" />}
                  label={t("expand", { size: ts(size) })}
                  hint={paidHint}
                  busy={running === "expand"}
                  disabled={busy || !left}
                  onRun={(words) => void run("expand", words)}
                />
                <PhotoTool
                  icon={<Eraser aria-hidden="true" />}
                  label={t("erase")}
                  hint={paidHint}
                  busy={running === "erase"}
                  disabled={busy || !left}
                  field={{
                    label: t("eraseLabel"),
                    placeholder: t("erasePlaceholder"),
                  }}
                  onRun={(words) => void run("erase", words)}
                />
                <PhotoTool
                  icon={<WandSparkles aria-hidden="true" />}
                  label={t("change")}
                  hint={paidHint}
                  busy={running === "change"}
                  disabled={busy || !left}
                  field={{
                    label: t("changeLabel"),
                    placeholder: t("changePlaceholder"),
                  }}
                  onRun={(words) => void run("change", words)}
                />
              </>
            )}
            {!cutout && !photoAi && (
              <p className="text-xs text-muted-foreground">{t("toolsOff")}</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
