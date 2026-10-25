"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@shared/hooks/async-runner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { LookFonts } from "@/components/covers/look-fonts";
import { ReelPreview } from "@/components/admin/reels/reel-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
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
import {
  deleteReel,
  downloadLink,
  getReel,
  renderReel,
  saveReel,
} from "@/lib/reels-api";
import { clock, reelLength, type Span } from "@/lib/reels/timeline";
import type {
  ReelDetail,
  ReelLayout,
  ReelOptions,
  ReelPatch,
  ReelStyle,
} from "@/types/reels";

// The caption languages the server translates into (backend/apps/reels/moments.py LANGUAGES).
const LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pl", "pt", "tr"];
const STYLES: ReelStyle[] = ["bold", "clean", "brand"];
const LAYOUTS: ReelLayout[] = ["auto", "center", "fit"];
const TYPING_MS = 700;
const POLL_MS = 2500;
const BOLD_FONT =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap";

/** One reel: its live preview, and everything about it the coach can change — the hook, where it starts and
 *  ends, the caption style and language, the framing, the extras and the post's text — each change saved at
 *  once. Making the video file is one button; the file downloads once it is ready. */
export function ReelEditor({ initial }: { initial: ReelDetail }) {
  const t = useTranslations("admin.reels.editor");
  const tr = useTranslations("admin.reels");
  const navigate = useNavigate();
  const [reel, setReel] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [endText, setEndText] = useState(initial.options.end_text);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const latest = useRef(0);

  // Every change goes to the server, which answers with the reel as it will draw it (its cuts, crop and
  // translation); an answer to an older change never overwrites a newer one.
  const save = useCallback(
    async (patch: ReelPatch) => {
      const ticket = ++latest.current;
      setSaving(true);
      try {
        const next = await saveReel(reel.id, patch);
        if (ticket === latest.current) setReel(next);
      } finally {
        if (ticket === latest.current) setSaving(false);
      }
    },
    [reel.id],
  );
  // Not useAsyncAction: it drops a call while one is in flight, and edits come quicker than saves.
  const change = useCallback(
    (patch: ReelPatch) => {
      save(patch).catch((err) => toast.error(errorMessage(err)));
    },
    [save],
  );

  // Typed fields save once typing stops.
  const typed = useRef({ title, caption, endText });
  useEffect(() => {
    const before = typed.current;
    if (
      before.title === title &&
      before.caption === caption &&
      before.endText === endText
    )
      return;
    const timer = setTimeout(() => {
      const patch: ReelPatch = {};
      if (before.title !== title) patch.title = title;
      if (before.caption !== caption) patch.caption = caption;
      if (before.endText !== endText) patch.options = { end_text: endText };
      typed.current = { title, caption, endText };
      change(patch);
    }, TYPING_MS);
    return () => clearTimeout(timer);
  }, [title, caption, endText, change]);

  // A video being made: look again until it is ready.
  useEffect(() => {
    if (reel.status !== "rendering") return;
    const timer = setInterval(() => {
      getReel(reel.id)
        .then((next) => {
          if (next.status === "rendering") return;
          setReel(next);
          if (next.status === "ready") toast.success(t("made"));
          else toast.error(next.error || t("notMade"));
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reel.status, reel.id, t]);

  const { run: make, loading: starting } = useAsyncAction(async () => {
    const next = await renderReel(reel.id);
    setReel((r) => ({ ...r, ...next }));
  });
  const { run: download, loading: fetching } = useAsyncAction(async () => {
    const { url } = await downloadLink(reel.id);
    window.location.assign(url);
  });
  const { run: remove, loading: deleting } = useAsyncAction(async () => {
    await deleteReel(reel.id);
    toast.success(t("deleted"));
    navigate(`/admin/reels?video=${reel.video}`);
  });

  const option = (key: keyof ReelOptions, value: boolean | string) =>
    change({ options: { [key]: value } as Partial<ReelOptions> });
  const nudge = (edge: "start" | "end", by: number) => {
    const at = Math.max(0, +(reel[edge] + by).toFixed(2));
    change(edge === "start" ? { start: at } : { end: at });
  };
  const length = reelLength(reel.keep as Span[]);
  const ready = reel.status === "ready" && !reel.stale;

  return (
    <div className="space-y-6">
      <LookFonts look={reel.brand.look} />
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
            {reel.title || tr("untitled")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("from", { video: reel.video_title })} · {clock(reel.start)}–
            {clock(reel.end)} · {t("length", { length: clock(length) })}
            {saving ? ` · ${t("saving")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex gap-2">
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
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <ReelPreview reel={reel} />
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
          <Section title={t("hook")}>
            <Input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t("hook")}
            />
            <Toggle
              id="opt-title"
              label={t("showHook")}
              checked={reel.options.title}
              onChange={(v) => option("title", v)}
            />
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
                  <span className="text-xs opacity-80">
                    {t(`styles.${style}`)}
                  </span>
                </button>
              ))}
            </div>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="reel-language">{t("language")}</Label>
              <Select
                value={reel.options.language || "spoken"}
                onValueChange={(v) =>
                  option("language", v === "spoken" ? "" : v)
                }
              >
                <SelectTrigger id="reel-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spoken">{t("asSpoken")}</SelectItem>
                  {LANGUAGES.filter((l) => l !== reel.source.language).map(
                    (l) => (
                      <SelectItem key={l} value={l}>
                        {t(`languages.${l}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section title={t("framing")}>
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
                  <span className="block font-medium">
                    {t(`layouts.${layout}`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`layouts.${layout}Hint`)}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t("extras")}>
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
                  value={endText}
                  maxLength={80}
                  placeholder={reel.end_card.line}
                  onChange={(e) => setEndText(e.target.value)}
                />
              </div>
            ) : null}
          </Section>

          <Section title={t("post")} hint={t("postHint")}>
            <Textarea
              value={caption}
              rows={5}
              maxLength={2200}
              onChange={(e) => setCaption(e.target.value)}
              aria-label={t("post")}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                navigator.clipboard.writeText(caption).then(
                  () => toast.success(t("copied")),
                  () => toast.error(t("notCopied")),
                )
              }
            >
              <Copy className="h-4 w-4" />
              {t("copy")}
            </Button>
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
            {reel.made_by !== "coach" ? (
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

function Section({
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

function Toggle({
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
