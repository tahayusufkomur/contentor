"use client";

import { useEffect, useState } from "react";
import { Check, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { SiteStyle } from "@shared/sections/types";
import type { LookCards, LookOption } from "@/lib/setup-flow";
import { getSiteStyle, styleFontsHref, styleVars } from "@/lib/site-styles";
import { LogoMarkSvg } from "@/components/shared/logo-mark";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./browser-frame";
import { LookTile } from "./look-tile";
import { SHELL_TOKENS } from "./tokens";

const WORDMARK = "Just my name, as text";

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
}) {
  const [shown, setShown] = useState<LookCards>(cards);
  // A look with a page behind it opens as that page on pick.
  const [preview, setPreview] = useState<LookOption | null>(null);
  const { run: more, loading } = useAsyncAction(
    async () => setShown(await onMore((shown.page ?? 0) + 1)),
    { errorToast: "Couldn’t load more logos. Try again." },
  );
  const isPicked = (value: string, label: string) =>
    chosen
      ? chosen === value
      : !!selected && selected.trim().toLowerCase() === label.toLowerCase();
  const enter = (i: number) => ({
    animationDelay: `${delay + Math.min(i, 15) * 40}ms`,
  });

  if (shown.kind === "style") {
    const styles = [...new Set(shown.options.map((o) => o.style ?? o.value))]
      .map((id) => getSiteStyle(id))
      .filter((s): s is SiteStyle => !!s);
    return (
      <div className="mt-8">
        {styles.map((s) => (
          <link key={s.id} rel="stylesheet" href={styleFontsHref(s)} />
        ))}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {shown.options.map((o, i) => (
            <CardButton
              key={o.value}
              picked={isPicked(o.value, o.label)}
              disabled={disabled}
              onClick={() => {
                onPick(o.value, o.label);
                if (shown.preview) setPreview(o);
              }}
              style={enter(i)}
              className="overflow-hidden p-0"
            >
              <LookTile
                styleId={o.style ?? o.value}
                paletteId={o.palette}
                brandName={brandName}
                headline={shown.headline}
                photos={shown.photos}
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
                {o.recommended && (
                  <span className="shrink-0 rounded-full bg-[var(--sf-brass-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-brass)]">
                    Suggested
                  </span>
                )}
              </span>
            </CardButton>
          ))}
        </div>
        {preview && shown.preview && (
          <LookPreview
            look={preview}
            cards={shown}
            brandName={brandName}
            host={host ?? ""}
            onClose={() => setPreview(null)}
          />
        )}
      </div>
    );
  }

  // Traced marks are drawn in the primary colour of the look the coach
  // picked: the logo as it will sit in their header.
  const look = getSiteStyle(shown.style ?? "");
  const markColor = look ? styleVars(look, shown.palette).primary : undefined;
  return (
    <div className="mt-8">
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
  onClose,
}: {
  look: LookOption;
  cards: LookCards;
  brandName: string;
  host: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
            {look.detail && (
              <p className="truncate text-[13px] text-white/70">
                {look.detail}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
            >
              Close
            </Button>
            <Button
              onClick={onClose}
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
                />
              </div>
            }
          />
        </div>
      </div>
    </ModalPortal>
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
