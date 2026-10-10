"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { SiteStyle } from "@shared/sections/types";
import type { LookCards, LookOption } from "@/lib/setup-flow";
import {
  STYLE_TAGS,
  getSiteStyle,
  paletteOf,
  styleFontsHref,
  styleVars,
} from "@/lib/site-styles";
import { LogoMarkSvg } from "@/components/shared/logo-mark";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./browser-frame";
import { LookTile } from "./look-tile";
import { SHELL_TOKENS } from "./tokens";

const WORDMARK = "Just my name, as text";
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4";

/** The look a style card stands for in a colourway: "journal:sage". */
const lookValue = (o: LookOption, palette: string) =>
  palette ? `${o.value}:${palette}` : o.value;
/** ...and its name, "Quiet Journal · Sage". */
const lookLabel = (o: LookOption, palette: string) =>
  `${o.label} · ${o.palettes?.find((p) => p.id === palette)?.label ?? "Original"}`;

/** The colourway of a style card the coach already picked, from the value
 * picked on this screen or the label of the answer they gave before. */
function pickedPalette(
  o: LookOption,
  chosen?: string,
  selected?: string,
): string | undefined {
  const hit = o.palettes?.find((p) =>
    chosen
      ? chosen === lookValue(o, p.id)
      : !!selected &&
        selected.trim().toLowerCase() === lookLabel(o, p.id).toLowerCase(),
  );
  return hit?.id;
}

/** A style's colourways as dots: the ground with the brand colour on it. */
function Swatches({
  option,
  value,
  disabled,
  onPick,
  className,
}: {
  option: LookOption;
  value: string;
  disabled?: boolean;
  onPick: (palette: string) => void;
  className?: string;
}) {
  const style = getSiteStyle(option.style ?? option.value);
  if (!style || (option.palettes?.length ?? 0) < 2) return null;
  return (
    <span
      role="radiogroup"
      aria-label={`${option.label} colours`}
      className={cn("flex items-center gap-1.5", className)}
    >
      {option.palettes?.map((p) => {
        const pal = paletteOf(style, p.id);
        return (
          <button
            key={p.id || "own"}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            aria-label={p.label}
            title={p.label}
            disabled={disabled}
            onClick={() => onPick(p.id)}
            style={{
              background: `linear-gradient(135deg, ${pal.background} 50%, ${pal.primary} 50%)`,
            }}
            className={cn(
              "size-5 rounded-full border border-[var(--sf-line-strong)] transition-transform motion-safe:hover:scale-110",
              value === p.id &&
                "ring-2 ring-[var(--sf-ink)] ring-offset-2 ring-offset-white",
            )}
          />
        );
      })}
    </span>
  );
}

/** Style and logo choices as big cards. ``selected`` is the label the coach
 * picked before (a question they went back to); ``chosen`` the value picked
 * on this screen but not sent yet (it wins). ``delay`` (ms) is when the
 * cards start springing in. */
export function LookCardsView({
  cards,
  brandName,
  host,
  selected,
  chosen,
  disabled,
  delay = 0,
  onPick,
  onMore,
  onLogoMore,
  onKeep,
}: {
  cards: LookCards;
  brandName: string;
  host?: string;
  selected?: string;
  chosen?: string;
  disabled: boolean;
  delay?: number;
  onPick: (value: string, label: string) => void;
  onMore: (page: number) => Promise<LookCards>;
  /** Starts three more generated logos (the parent refreshes the card). */
  onLogoMore?: () => Promise<LookCards>;
  /** "Keep this look" in the preview: the picked look is the answer. */
  onKeep: () => void;
}) {
  const [shown, setShown] = useState<LookCards>(cards);
  // A look with a page behind it opens as that page on pick.
  const [preview, setPreview] = useState<LookOption | null>(null);
  // The colourway each style card is showing, by style id ("" = its own).
  const [palettes, setPalettes] = useState<Record<string, string>>({});
  // The looks grouped behind "More looks", once the coach asks for them.
  const [others, setOthers] = useState(false);
  // The looks a tag filters to ("" = all).
  const [tag, setTag] = useState("");
  const paletteFor = (o: LookOption) =>
    palettes[o.value] ?? pickedPalette(o, chosen, selected) ?? "";
  // The guide's pick is selected the first time the coach lands on the
  // question; tapping any look opens it as a page.
  const picked = useRef(false);
  useEffect(() => {
    const pick = shown.options.find((o) => o.recommended);
    if (picked.current || shown.kind !== "style" || !pick) return;
    if (selected || chosen) return;
    picked.current = true;
    onPick(pick.value, lookLabel(pick, ""));
  }, [shown, selected, chosen, onPick]);
  const { run: more, loading } = useAsyncAction(
    async () => setShown(await onMore((shown.page ?? 0) + 1)),
    { errorToast: "Couldn’t load more logos. Try again." },
  );
  const { run: logoMore, loading: moreLoading } = useAsyncAction(
    async () => {
      await onLogoMore?.();
    },
    { errorToast: "Couldn’t start more logos. Try again." },
  );
  const isPicked = (value: string, label: string) =>
    chosen
      ? chosen === value
      : !!selected && selected.trim().toLowerCase() === label.toLowerCase();
  const isLookPicked = (o: LookOption) =>
    chosen
      ? chosen === o.value || chosen.startsWith(`${o.value}:`)
      : !!selected &&
        selected.trim().toLowerCase().startsWith(o.label.toLowerCase());
  const pickLook = (o: LookOption, palette: string) => {
    setPalettes((m) => ({ ...m, [o.value]: palette }));
    onPick(lookValue(o, palette), lookLabel(o, palette));
    if (preview?.value === o.value) setPreview({ ...o, palette });
  };
  const enter = (i: number) => ({
    animationDelay: `${delay + Math.min(i, 15) * 40}ms`,
  });

  if (shown.kind === "style") {
    const styles = [...new Set(shown.options.map((o) => o.style ?? o.value))]
      .map((id) => getSiteStyle(id))
      .filter((s): s is SiteStyle => !!s);
    const suggested = shown.options.find((o) => o.recommended);
    const chips: [string, string][] = [
      ["", "All"],
      ...STYLE_TAGS.filter(([t]) =>
        shown.options.some((o) => o.tags?.includes(t)),
      ),
    ];
    const options = tag
      ? shown.options.filter((o) => o.tags?.includes(tag))
      : shown.options;
    // One look per hero layout first (the best ranked of each; the guide's
    // pick ranks first), the near-twins grouped under "More looks".
    const seen = new Set<string>();
    const leads: LookOption[] = [];
    const rest = new Map<string, LookOption[]>();
    for (const o of options) {
      const g = o.group || o.value;
      if (!seen.has(g)) {
        seen.add(g);
        leads.push(o);
      } else rest.set(g, [...(rest.get(g) ?? []), o]);
    }
    const groups = [...rest];
    // A look picked before that is one of the grouped ones keeps them open.
    const open = others || groups.some(([, l]) => l.some(isLookPicked));
    const card = (o: LookOption, i: number) => {
      const palette = paletteFor(o);
      return (
        <div key={o.value} className="relative">
          <CardButton
            picked={isLookPicked(o)}
            disabled={disabled}
            onClick={() => {
              pickLook(o, palette);
              if (shown.preview) setPreview({ ...o, palette });
            }}
            style={enter(i)}
            className="w-full overflow-hidden p-0"
          >
            <LookTile
              styleId={o.style ?? o.value}
              paletteId={palette}
              brandName={brandName}
              headline={shown.headline}
              photos={shown.photos}
              copy={shown.preview?.copy}
            />
            <span className="flex items-center justify-between gap-2 border-t border-[var(--sf-line)] px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">
                  {o.label}
                </span>
                {o.detail && (
                  <span className="block truncate text-[12px] text-[var(--sf-graphite)]">
                    {o.detail}
                  </span>
                )}
              </span>
              {/* Room for the colour dots laid over the card's corner. */}
              <span
                aria-hidden
                style={{
                  width: `${(o.palettes?.length ?? 0) * 26}px`,
                }}
                className="shrink-0"
              />
            </span>
          </CardButton>
          {o.recommended && (
            <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-[var(--sf-brass-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-brass)]">
              Suggested
            </span>
          )}
          <Swatches
            option={o}
            value={palette}
            disabled={disabled}
            onPick={(p) => pickLook(o, p)}
            className="absolute bottom-3.5 right-3.5"
          />
        </div>
      );
    };
    return (
      <div className="mt-8">
        {suggested?.reason && (
          <p className="mb-4 text-[14px] text-[var(--sf-graphite)]">
            <span className="font-semibold text-[var(--sf-ink)]">
              {suggested.label}
            </span>{" "}
            is our pick. {suggested.reason}
          </p>
        )}
        {chips.length > 1 && (
          <div
            role="group"
            aria-label="Filter looks"
            className="mb-5 flex flex-wrap gap-1.5"
          >
            {chips.map(([id, label]) => (
              <button
                key={id || "all"}
                type="button"
                aria-pressed={tag === id}
                onClick={() => setTag(id)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors",
                  tag === id
                    ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                    : "border-[var(--sf-line-strong)] bg-white hover:border-[var(--sf-ink)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {styles.map((s) => (
          <link key={s.id} rel="stylesheet" href={styleFontsHref(s)} />
        ))}
        <div className={GRID}>{leads.map(card)}</div>
        {groups.length > 0 &&
          (open ? (
            groups.map(([group, list]) => (
              <section key={group} className="mt-8">
                <h3 className="mb-3 text-[14px] font-semibold">
                  More looks: {group.toLowerCase()}
                </h3>
                <div className={GRID}>
                  {list.map((o, i) => card(o, leads.length + i))}
                </div>
              </section>
            ))
          ) : (
            <Button
              variant="ghost"
              size="lg"
              disabled={disabled}
              onClick={() => setOthers(true)}
              className="mt-3 rounded-full"
            >
              More looks ({groups.reduce((n, [, l]) => n + l.length, 0)})
            </Button>
          ))}
        {preview && shown.preview && (
          <LookPreview
            look={preview}
            cards={shown}
            brandName={brandName}
            host={host ?? ""}
            onPalette={(p) => pickLook(preview, p)}
            onClose={() => setPreview(null)}
            onKeep={onKeep}
          />
        )}
      </div>
    );
  }

  if (shown.kind === "calendar") {
    return (
      <div className="mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {shown.options.map((o, i) => (
          <CardButton
            key={o.value}
            picked={isPicked(o.value, o.label)}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
            style={enter(i)}
            className="overflow-hidden p-0"
          >
            <CalendarSketch kind={o.value} />
            <span className="block border-t border-[var(--sf-line)] px-3.5 py-2.5">
              <span className="block text-[14px] font-semibold">{o.label}</span>
              {o.detail && (
                <span className="block text-[12px] text-[var(--sf-graphite)]">
                  {o.detail}
                </span>
              )}
            </span>
          </CardButton>
        ))}
      </div>
    );
  }

  // Traced marks are drawn in the primary colour of the look the coach
  // picked: the logo as it will sit in their header.
  const look = getSiteStyle(shown.style ?? "");
  const markColor = look ? styleVars(look, shown.palette).primary : undefined;
  // Read from ``cards``, not ``shown``: the batch lands while the card is open.
  const generated = cards.generated;
  return (
    <div className="mt-8">
      {generated && generated.state !== "none" && (
        <section className="mb-8" aria-label="Designed for you">
          <p className="mb-3 text-[13px] font-medium text-[var(--sf-graphite)]">
            {generated.state === "ready"
              ? "Designed for you"
              : "Designing your logo"}
          </p>
          {generated.state === "building" ? (
            <>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--sf-graphite)]">
                Designing your logo, about two minutes. Pick a ready-made mark
                below meanwhile, or wait.
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                {generated.options.map((o, i) => (
                  <CardButton
                    key={o.value}
                    picked={isPicked(o.value, o.label)}
                    disabled={disabled}
                    onClick={() => onPick(o.value, o.label)}
                    style={enter(i)}
                    className="p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={o.image_url}
                      alt={o.label}
                      className="aspect-[4/3] w-full rounded-lg object-contain"
                    />
                    <span className="mt-2 block truncate text-center text-[13px]">
                      {o.label}
                    </span>
                  </CardButton>
                ))}
              </div>
              {onLogoMore && (
                <Button
                  variant="ghost"
                  size="lg"
                  loading={moreLoading}
                  loadingText="Starting…"
                  disabled={disabled}
                  onClick={() => logoMore()}
                  className="mt-3 rounded-full"
                >
                  Three more
                </Button>
              )}
            </>
          )}
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {shown.options.map((o: LookOption, i) => (
          <CardButton
            key={o.value}
            picked={isPicked(o.value, o.label)}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
            style={enter(i)}
            className="p-3"
          >
            {o.mark ? (
              <span
                className="flex aspect-square w-full items-center justify-center p-[12%]"
                style={{ color: markColor }}
              >
                <LogoMarkSvg
                  mark={o.mark}
                  label={o.label}
                  className="max-h-full w-full"
                />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={o.image_url}
                alt={o.label}
                className="mx-auto aspect-square w-full rounded-lg object-contain"
              />
            )}
            <span className="mt-2 block truncate text-center text-[13px]">
              {o.label}
            </span>
          </CardButton>
        ))}
        <CardButton
          picked={isPicked("wordmark", WORDMARK)}
          disabled={disabled}
          onClick={() => onPick("wordmark", WORDMARK)}
          style={enter(shown.options.length)}
          className="p-3"
        >
          <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--sf-tint)]">
            <Type className="size-8 text-[var(--sf-graphite)]" aria-hidden />
          </span>
          <span className="mt-2 block text-center text-[13px]">
            Just my name
          </span>
        </CardButton>
      </div>
      {shown.more && (
        <Button
          variant="ghost"
          size="lg"
          loading={loading}
          disabled={disabled}
          onClick={() => more()}
          className="mt-3 rounded-full"
        >
          Show me others
        </Button>
      )}
    </div>
  );
}

/** A look as a whole home page, in a browser frame over the questions:
 * the coach's brand, pitch and photos in the style's own layouts, sample
 * copy turned to their subject. Scroll it, then keep it or close. Escape
 * closes too. */
function LookPreview({
  look,
  cards,
  brandName,
  host,
  onPalette,
  onClose,
  onKeep,
}: {
  look: LookOption;
  cards: LookCards;
  brandName: string;
  host: string;
  onPalette: (palette: string) => void;
  onClose: () => void;
  onKeep: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Keeping the look is the answer: send it and move on.
  const keep = () => {
    onClose();
    onKeep();
  };
  const subject = cards.preview?.subject;
  const words = {
    ...(brandName ? { "Maya Laurent": brandName } : {}),
    Maya: "the coach",
    ...(subject ? { yoga: subject } : {}),
  };
  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal
        aria-label={`${look.label}, as a page`}
        style={{ ...SHELL_TOKENS, backgroundColor: "rgb(34 33 31 / 0.6)" }}
        className="sf-shell fixed inset-0 z-50 flex flex-col p-3 backdrop-blur-sm motion-safe:animate-fade-in sm:p-6"
        onClick={onClose}
      >
        <div
          className="mx-auto flex w-full max-w-[1400px] shrink-0 items-center justify-between gap-3 pb-3 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{look.label}</p>
            {(look.recommended && look.reason) || look.detail ? (
              <p className="truncate text-[13px] text-white/70">
                {look.recommended && look.reason ? look.reason : look.detail}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Swatches
              option={look}
              value={look.palette ?? ""}
              onPick={onPalette}
              className="mr-2 rounded-full bg-white/90 px-2.5 py-1.5"
            />
            <Button
              variant="ghost"
              onClick={onClose}
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
            >
              {look.recommended ? "See other looks" : "Close"}
            </Button>
            <Button
              onClick={keep}
              className="rounded-full bg-white text-[var(--sf-ink)] hover:bg-white/90"
            >
              Keep this look
            </Button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 motion-safe:animate-[sf-rise_.5s_ease-out_both]"
          onClick={(e) => e.stopPropagation()}
        >
          <BrowserFrame
            host={host}
            path={null}
            device="desktop"
            reloadKey={0}
            overlay={
              <div className="absolute inset-0 overflow-y-auto overscroll-contain bg-white">
                <LookTile
                  page
                  styleId={look.style ?? look.value}
                  paletteId={look.palette}
                  brandName={brandName}
                  headline={cards.headline}
                  photos={cards.photos}
                  words={words}
                  body={cards.preview?.body}
                  copy={cards.preview?.copy}
                />
              </div>
            }
          />
        </div>
      </div>
    </ModalPortal>
  );
}

/** A calendar layout as a small picture: the month grid with a day picked, or
 * the agenda as dated rows. */
function CalendarSketch({ kind }: { kind: string }) {
  const bar = "rounded-full bg-[var(--sf-line-strong)]";
  return (
    <span
      aria-hidden
      className="block aspect-[16/9] w-full bg-[var(--sf-tint)] p-4"
    >
      {kind === "agenda" ? (
        <span className="flex h-full flex-col justify-center gap-2.5">
          {[0, 1, 2].map((r) => (
            <span key={r} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 flex-col items-center justify-center rounded-lg bg-white text-[10px] font-semibold shadow-sm">
                {10 + r * 3}
              </span>
              <span className="flex-1 rounded-lg bg-white px-3 py-2 shadow-sm">
                <span className={cn("block h-1.5 w-2/3", bar)} />
                <span className={cn("mt-1.5 block h-1.5 w-1/3", bar)} />
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="grid h-full grid-cols-7 grid-rows-5 gap-1">
          {Array.from({ length: 35 }, (_, n) => (
            <span
              key={n}
              className={cn(
                "rounded-[5px] bg-white shadow-sm",
                n === 16 && "bg-[var(--sf-ink)]",
                [4, 11, 18, 25, 22].includes(n) &&
                  "ring-2 ring-inset ring-[var(--sf-brass)]",
              )}
            />
          ))}
        </span>
      )}
    </span>
  );
}

function CardButton({
  picked,
  disabled,
  onClick,
  style,
  className,
  children,
}: {
  picked: boolean;
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={cn(
        "relative rounded-2xl border bg-white text-left transition-[border-color,box-shadow,transform] duration-200 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] disabled:opacity-50",
        picked
          ? "border-[var(--sf-ink)] shadow-[0_0_0_1px_var(--sf-ink)]"
          : "border-[var(--sf-line)] hover:border-[var(--sf-line-strong)] hover:shadow-[0_10px_24px_-16px_rgb(48_36_20/0.45)]",
        className,
      )}
    >
      {children}
      {picked && (
        <span
          aria-hidden
          className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)]"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
