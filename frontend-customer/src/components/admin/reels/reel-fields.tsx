"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { ReelEditing } from "@/components/admin/reels/use-reel";
import { COVER_DESIGNS, ReelCover } from "@/components/reels/reel-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { focus } from "@/lib/reels/cover";
import { clock } from "@/lib/reels/timeline";
import type {
  ReelDetail,
  ReelLayout,
  ReelOptions,
  ReelStyle,
} from "@/types/reels";

// The fields of a reel the reel editor and the video studio both show, each change saved at once (use-reel).

// The caption languages the server translates into (backend/apps/reels/moments.py LANGUAGES).
const LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pl", "pt", "tr"];
const STYLES: ReelStyle[] = ["bold", "clean", "brand"];
const LAYOUTS: ReelLayout[] = ["auto", "center", "fit"];

type Fields = { editing: ReelEditing };

function useOption(editing: ReelEditing) {
  return (key: keyof ReelOptions, value: boolean | string) =>
    editing.change({ options: { [key]: value } as Partial<ReelOptions> });
}

/** The reel's first second: the hook, the design, the frame and the series label. */
export function CoverFields({ editing }: Fields) {
  const t = useTranslations("admin.reels.editor");
  const { reel, live, typed, setTyped, change } = editing;
  const option = useOption(editing);
  return (
    <>
      <div className="max-w-xl space-y-1.5">
        <Label htmlFor="reel-hook">{t("hook")}</Label>
        <Input
          id="reel-hook"
          value={typed.title}
          maxLength={120}
          onChange={(e) => setTyped("title", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("hookHint")}</p>
      </div>
      <div
        className="grid max-w-xl grid-cols-4 gap-2"
        role="radiogroup"
        aria-label={t("design")}
      >
        {COVER_DESIGNS.map((design) => (
          <button
            key={design}
            type="button"
            role="radio"
            aria-checked={reel.cover.design === design}
            onClick={() => change({ cover: { design } })}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              reel.cover.design === design
                ? "border-primary ring-2 ring-primary"
                : "hover:border-foreground/40",
            )}
          >
            <ReelCover
              cover={{ ...live.cover, design }}
              brand={reel.cover}
              className="rounded-md"
            />
            <span className="px-0.5 text-xs font-medium">
              {t(`designs.${design}`)}
            </span>
          </button>
        ))}
      </div>
      {reel.frames.length ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id="reel-frames">
            {t("frame")}
          </p>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="radiogroup"
            aria-labelledby="reel-frames"
          >
            {reel.frames.map((frame) => (
              <button
                key={frame.key}
                type="button"
                role="radio"
                aria-checked={reel.cover.frame === frame.key}
                aria-label={t("frameAt", { at: clock(frame.at) })}
                onClick={() => change({ cover: { frame: frame.key } })}
                className={cn(
                  "relative w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                  reel.cover.frame === frame.key
                    ? "border-primary"
                    : "border-transparent hover:border-foreground/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
                <img
                  src={frame.url}
                  alt=""
                  className="aspect-[9/16] w-full object-cover"
                  style={{
                    objectPosition: focus(frame.aspect, 9 / 16, frame.face),
                  }}
                />
                {frame.pick ? (
                  <span className="absolute inset-x-0 bottom-0 bg-background/85 py-0.5 text-center text-[10px] font-medium">
                    {t("ourPick")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("noFrames")}</p>
      )}
      {reel.cover.design === "series" ? (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="reel-label">{t("label")}</Label>
          <Input
            id="reel-label"
            value={typed.label}
            maxLength={40}
            placeholder={t("labelPlaceholder")}
            onChange={(e) => setTyped("label", e.target.value)}
          />
        </div>
      ) : null}
      <Toggle
        id="opt-cover"
        label={t("openWithCover")}
        checked={reel.options.cover}
        onChange={(v) => option("cover", v)}
      />
    </>
  );
}

/** The captions' style and language. */
export function CaptionFields({ editing }: Fields) {
  const t = useTranslations("admin.reels.editor");
  const { reel, change } = editing;
  const option = useOption(editing);
  return (
    <>
      <div
        className="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={t("captions")}
      >
        {STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={reel.style === style}
            onClick={() => change({ style })}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border bg-neutral-900 px-2 py-3 text-white transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              reel.style === style
                ? "border-primary ring-2 ring-primary"
                : "hover:border-foreground/40",
            )}
          >
            <StyleSample style={style} reel={reel} />
            <span className="text-xs opacity-80">{t(`styles.${style}`)}</span>
          </button>
        ))}
      </div>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="reel-language">{t("language")}</Label>
        <Select
          value={reel.options.language || "spoken"}
          onValueChange={(v) => option("language", v === "spoken" ? "" : v)}
        >
          <SelectTrigger id="reel-language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spoken">{t("asSpoken")}</SelectItem>
            {LANGUAGES.filter((l) => l !== reel.source.language).map((l) => (
              <SelectItem key={l} value={l}>
                {t(`languages.${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

/** How the 9:16 window sits on the video's frame. */
export function FramingFields({ editing }: Fields) {
  const t = useTranslations("admin.reels.editor");
  const { reel, change } = editing;
  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="radiogroup"
      aria-label={t("framing")}
    >
      {LAYOUTS.map((layout) => (
        <button
          key={layout}
          type="button"
          role="radio"
          aria-checked={reel.layout === layout}
          onClick={() => change({ layout })}
          className={cn(
            "rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
            reel.layout === layout
              ? "border-primary bg-primary/5"
              : "hover:border-foreground/40",
          )}
        >
          <span className="block font-medium">{t(`layouts.${layout}`)}</span>
          <span className="block text-xs text-muted-foreground">
            {t(`layouts.${layout}Hint`)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The pauses, the progress bar, the sound, the photos and the end card. */
export function ExtrasFields({ editing }: Fields) {
  const t = useTranslations("admin.reels.editor");
  const { reel, typed, setTyped } = editing;
  const option = useOption(editing);
  return (
    <>
      <Toggle
        id="opt-cuts"
        label={t("cuts")}
        checked={reel.options.cuts}
        onChange={(v) => option("cuts", v)}
      />
      <Toggle
        id="opt-progress"
        label={t("progress")}
        checked={reel.options.progress}
        onChange={(v) => option("progress", v)}
      />
      <Toggle
        id="opt-audio"
        label={t("cleanAudio")}
        checked={reel.options.clean_audio}
        onChange={(v) => option("clean_audio", v)}
      />
      <Toggle
        id="opt-cutaways"
        label={t("cutaways")}
        hint={reel.ideas.length ? undefined : t("noIdeas")}
        checked={reel.options.cutaways}
        disabled={!reel.ideas.length}
        onChange={(v) => option("cutaways", v)}
      />
      <Toggle
        id="opt-end"
        label={t("endCard")}
        checked={reel.options.end_card}
        onChange={(v) => option("end_card", v)}
      />
      {reel.options.end_card ? (
        <div className="max-w-sm space-y-1.5 pl-12">
          <Label htmlFor="reel-end-text">{t("endText")}</Label>
          <Input
            id="reel-end-text"
            value={typed.endText}
            maxLength={80}
            placeholder={reel.end_card.line}
            onChange={(e) => setTyped("endText", e.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}

/** The text posted under the reel. */
export function PostFields({ editing }: Fields) {
  const t = useTranslations("admin.reels.editor");
  const { typed, setTyped } = editing;
  return (
    <>
      <Textarea
        value={typed.caption}
        rows={5}
        maxLength={2200}
        onChange={(e) => setTyped("caption", e.target.value)}
        aria-label={t("post")}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() =>
          navigator.clipboard.writeText(typed.caption).then(
            () => toast.success(t("copied")),
            () => toast.error(t("notCopied")),
          )
        }
      >
        <Copy className="h-4 w-4" />
        {t("copy")}
      </Button>
    </>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <Label
        htmlFor={id}
        className={cn("font-normal", disabled && "text-muted-foreground")}
      >
        {label}
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </Label>
    </div>
  );
}

/** "Aa" in the style, as the captions will look. */
function StyleSample({ style, reel }: { style: ReelStyle; reel: ReelDetail }) {
  const look = reel.brand.look_fonts;
  const shared = { fontSize: 22, lineHeight: 1.1, fontWeight: 700 } as const;
  if (style === "bold")
    return (
      <span
        style={{
          ...shared,
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          textShadow: "0 0 3px #000",
        }}
      >
        AA <span style={{ color: reel.brand.highlight }}>BB</span>
      </span>
    );
  if (style === "clean")
    return (
      <span
        style={{
          ...shared,
          fontSize: 18,
          background: "rgba(0,0,0,.62)",
          padding: "0 6px",
          fontFamily: `'${look.body}', system-ui, sans-serif`,
        }}
      >
        Aa <span style={{ color: reel.brand.highlight }}>Bb</span>
      </span>
    );
  return (
    <span
      style={{
        ...shared,
        fontFamily: `'${look.display}', Georgia, serif`,
        textShadow: `0 0 3px ${reel.brand.edge}, 0 0 3px ${reel.brand.edge}`,
      }}
    >
      Aa <span style={{ color: reel.brand.highlight }}>Bb</span>
    </span>
  );
}
