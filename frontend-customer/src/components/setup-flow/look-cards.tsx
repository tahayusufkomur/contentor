"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Type, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { SiteStyle } from "@shared/sections/types";
import { headerNavLinks } from "@/lib/navbar";
import type { LookCards, LookOption } from "@/lib/setup-flow";
import {
  STYLE_TAGS,
  getSiteStyle,
  paletteOf,
  styleFontsHref,
  styleVars,
} from "@/lib/site-styles";
import { LogoMarkSvg, TintedMark } from "@/components/shared/logo-mark";
import { uploadImage } from "@/components/owner/logo-uploader";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./browser-frame";
import {
  FooterSketch,
  Lockup,
  NavbarSketch,
  NavbarStudioPreview,
  type SketchLogo,
} from "./chrome-sketch";
import { LookTile } from "./look-tile";
import { SHELL_TOKENS } from "./tokens";

const WORDMARK = "Just my name, as text";
const UPLOADED = "My own logo";
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
              "size-6 rounded-full border border-[var(--sf-line-strong)] transition-transform motion-safe:hover:scale-110",
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
  const availableNavLinks = shown.available_links ?? shown.links ?? [];
  const [navHrefs, setNavHrefs] = useState<string[]>(() => {
    const initial = shown.custom_links
      ? (shown.links ?? [])
      : headerNavLinks(shown.links ?? [], true);
    return initial.map((l) => l.href);
  });
  const [showCta, setShowCta] = useState<boolean>(
    () => shown.show_cta ?? Boolean(shown.cta),
  );
  const [transparent, setTransparent] = useState<boolean>(() =>
    Boolean(shown.transparent_over_hero),
  );
  // How her mark sits beside her name: the way her header has it now.
  const [logoLayout, setLogoLayout] = useState(
    () => shown.logo_layout ?? "horizontal",
  );
  const chosenLayout = (() => {
    if (!chosen) return undefined;
    if (chosen.startsWith("{")) {
      try {
        const parsed = JSON.parse(chosen) as { layout?: string };
        return parsed.layout;
      } catch {
        return chosen;
      }
    }
    return chosen;
  })();
  const paletteFor = (o: LookOption) =>
    palettes[o.value] ?? pickedPalette(o, chosen, selected) ?? "";
  // The guide's pick is selected the first time the coach lands on the
  // question (a look, the header, the footer); tapping any look opens it as
  // a page.
  const picked = useRef(false);
  useEffect(() => {
    const pick = shown.options.find((o) => o.recommended);
    if (picked.current || !pick) return;
    if (!["style", "navbar", "footer"].includes(shown.kind)) return;
    if (selected || chosen) return;
    picked.current = true;
    onPick(
      pick.value,
      shown.kind === "style" ? lookLabel(pick, "") : pick.label,
    );
  }, [shown, selected, chosen, onPick]);
  const { run: more, loading } = useAsyncAction(
    async () => setShown(await onMore((shown.page ?? 0) + 1)),
    { errorToast: "Couldn’t load more logos. Try again." },
  );
  const isPicked = (value: string, label: string) =>
    chosenLayout
      ? chosenLayout === value
      : !!selected &&
        (selected.trim().toLowerCase() === label.toLowerCase() ||
          selected.trim().toLowerCase().startsWith(`${label.toLowerCase()} ·`));
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
    // Only tags the best-ranked looks carry (ranked by niche and tone), so a
    // desk-yoga coach is never offered "Sexy".
    const fits = shown.options.slice(0, 8);
    const chips: [string, string][] = [
      ["", "All"],
      ...STYLE_TAGS.filter(([t]) => fits.some((o) => o.tags?.includes(t))),
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
            {/* On a phone the colour dots sit under the text, not beside it. */}
            <span className="flex items-center justify-between gap-2 border-t border-[var(--sf-line)] px-3.5 pb-11 pt-2.5 sm:py-2.5">
              <span className="min-w-0">
                {/* The badge sits by the name: on the picture it covered
                    the coach's own brand name. */}
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="max-w-full shrink-0 truncate text-[14px] font-semibold">
                    {o.label}
                  </span>
                  {o.recommended && (
                    <span className="shrink-0 rounded-full bg-[var(--sf-brass-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-brass)]">
                      Suggested
                    </span>
                  )}
                </span>
                {o.detail && (
                  <span className="line-clamp-2 text-[12px] leading-snug text-[var(--sf-graphite)]">
                    {o.detail}
                  </span>
                )}
              </span>
              {/* Room for the colour dots laid over the card's corner. */}
              <span
                aria-hidden
                style={{
                  width: `${(o.palettes?.length ?? 0) * 30}px`,
                }}
                className="hidden shrink-0 sm:block"
              />
            </span>
          </CardButton>
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

  if (shown.kind === "navbar" || shown.kind === "footer") {
    const suggested = shown.options.find((o) => o.recommended);
    const look = getSiteStyle(shown.style ?? "");
    const colors = look ? paletteOf(look, shown.palette) : undefined;
    const brand = brandName || shown.brand || "";
    const activeLayout =
      chosenLayout ??
      shown.options.find((o) => isPicked(o.value, o.label))?.value ??
      suggested?.value ??
      shown.options[0]?.value ??
      "classic";
    const activeLinks = availableNavLinks.filter((l) =>
      navHrefs.includes(l.href),
    );
    const activeCta = showCta ? shown.cta || "Get Started" : "";
    // Only a coach with a mark is asked how it sits.
    const logo: SketchLogo | undefined = shown.logo_layouts
      ? { mark: shown.logo_mark, url: shown.logo_url }
      : undefined;
    const emitNavbar = (
      nextLayout: string,
      nextHrefs: string[],
      nextCta: boolean,
      nextTransparent: boolean,
      nextLogo = logoLayout,
    ) => {
      const opt = shown.options.find((o) => o.value === nextLayout);
      const pickedLinks = availableNavLinks.filter((l) =>
        nextHrefs.includes(l.href),
      );
      const linkSummary = pickedLinks.map((l) => l.label).join(", ");
      const label = opt
        ? linkSummary
          ? `${opt.label} · ${linkSummary}`
          : opt.label
        : nextLayout;
      onPick(
        JSON.stringify({
          layout: nextLayout,
          links: pickedLinks.map((l) => l.href),
          show_cta: nextCta,
          transparent_over_hero: nextTransparent,
          ...(logo ? { logo_layout: nextLogo } : {}),
        }),
        label,
      );
    };

    return (
      <div className="mt-8 space-y-6">
        {suggested?.reason && (
          <p className="text-[14px] text-[var(--sf-graphite)]">
            <span className="font-semibold text-[var(--sf-ink)]">
              {suggested.label}
            </span>{" "}
            is our pick. {suggested.reason}
          </p>
        )}
        <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {shown.options.map((o, i) => (
            <CardButton
              key={o.value}
              picked={isPicked(o.value, o.label)}
              disabled={disabled}
              onClick={() =>
                shown.kind === "navbar"
                  ? emitNavbar(o.value, navHrefs, showCta, transparent)
                  : onPick(o.value, o.label)
              }
              style={enter(i)}
              className="overflow-hidden p-0"
              checkClassName="bottom-3 right-3"
            >
              {shown.kind === "navbar" ? (
                <NavbarSketch
                  layout={o.value}
                  brand={brand}
                  logo={logo}
                  logoLayout={logoLayout}
                  links={activeLinks}
                  cta={activeCta}
                  transparent={transparent}
                  keepPicked
                  colors={colors}
                />
              ) : (
                <FooterSketch
                  layout={o.value}
                  brand={brand}
                  links={shown.links ?? []}
                  socials={shown.socials ?? []}
                  colors={colors}
                />
              )}
              <span className="block border-t border-[var(--sf-line)] py-2.5 pl-3.5 pr-10">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-[14px] font-semibold">{o.label}</span>
                  {o.recommended && (
                    <span className="shrink-0 rounded-full bg-[var(--sf-brass-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-brass)]">
                      Suggested
                    </span>
                  )}
                </span>
                {o.detail && (
                  <span className="block text-[12px] text-[var(--sf-graphite)]">
                    {o.detail}
                  </span>
                )}
              </span>
            </CardButton>
          ))}
        </div>

        {shown.kind === "navbar" && (
          <div className="max-w-3xl space-y-5">
            {logo && (
              <div className="rounded-2xl border border-[var(--sf-line)] bg-white p-4">
                <span className="mb-2.5 block text-[13.5px] font-semibold text-[var(--sf-ink)]">
                  How your logo sits
                </span>
                <div
                  role="group"
                  aria-label="How your logo sits"
                  className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
                >
                  {(shown.logo_layouts ?? []).map((o) => (
                    <CardButton
                      key={o.value}
                      picked={logoLayout === o.value}
                      disabled={disabled}
                      onClick={() => {
                        setLogoLayout(o.value);
                        emitNavbar(
                          activeLayout,
                          navHrefs,
                          showCta,
                          transparent,
                          o.value,
                        );
                      }}
                      className="overflow-hidden p-0"
                      checkClassName="right-2 top-2"
                    >
                      <span
                        className="flex h-20 items-center justify-center px-3"
                        style={{ background: colors?.surface }}
                      >
                        <Lockup
                          logo={logo}
                          layout={o.value}
                          markClassName="h-8"
                          color={colors?.primary ?? "var(--sf-ink)"}
                        >
                          <span
                            className="line-clamp-2 text-[13px] font-bold leading-tight"
                            style={{ color: colors?.foreground }}
                          >
                            {brand || "Your name"}
                          </span>
                        </Lockup>
                      </span>
                      <span className="block border-t border-[var(--sf-line)] px-3 py-2 text-[12.5px] font-semibold">
                        {o.label}
                      </span>
                    </CardButton>
                  ))}
                </div>
              </div>
            )}

            {availableNavLinks.length > 0 && (
              <div className="rounded-2xl border border-[var(--sf-line)] bg-white p-4">
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
                    Pages in your header menu
                  </span>
                  <span className="text-[12px] text-[var(--sf-graphite)]">
                    Tap to add or remove
                  </span>
                </div>
                <div
                  role="group"
                  aria-label="Pages in your header menu"
                  className="flex flex-wrap gap-2"
                >
                  {availableNavLinks.map((link) => {
                    const active = navHrefs.includes(link.href);
                    return (
                      <button
                        key={link.href}
                        type="button"
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => {
                          const next = active
                            ? navHrefs.filter((h) => h !== link.href)
                            : [...navHrefs, link.href];
                          setNavHrefs(next);
                          emitNavbar(activeLayout, next, showCta, transparent);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                          active
                            ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                            : "border-[var(--sf-line-strong)] bg-[var(--sf-tint)] text-[var(--sf-graphite)] hover:border-[var(--sf-ink)] hover:text-[var(--sf-ink)]",
                        )}
                      >
                        {active ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : (
                          <Plus className="size-3.5" aria-hidden />
                        )}
                        {link.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[var(--sf-line)] bg-white p-4">
              <span className="mb-2.5 block text-[13.5px] font-semibold text-[var(--sf-ink)]">
                Header elements
              </span>
              <div
                role="group"
                aria-label="Header elements"
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  aria-pressed={showCta}
                  disabled={disabled}
                  onClick={() => {
                    const next = !showCta;
                    setShowCta(next);
                    emitNavbar(activeLayout, navHrefs, next, transparent);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    showCta
                      ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                      : "border-[var(--sf-line-strong)] bg-[var(--sf-tint)] text-[var(--sf-graphite)] hover:border-[var(--sf-ink)] hover:text-[var(--sf-ink)]",
                  )}
                >
                  {showCta ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Plus className="size-3.5" aria-hidden />
                  )}
                  “{shown.cta || "Get Started"}” button
                </button>
                {activeLayout !== "pill" && (
                  <button
                    type="button"
                    aria-pressed={transparent}
                    disabled={disabled}
                    onClick={() => {
                      const next = !transparent;
                      setTransparent(next);
                      emitNavbar(activeLayout, navHrefs, showCta, next);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      transparent
                        ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                        : "border-[var(--sf-line-strong)] bg-[var(--sf-tint)] text-[var(--sf-graphite)] hover:border-[var(--sf-ink)] hover:text-[var(--sf-ink)]",
                    )}
                  >
                    {transparent ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <Plus className="size-3.5" aria-hidden />
                    )}
                    Transparent over hero
                  </button>
                )}
              </div>
            </div>

            <NavbarStudioPreview
              layout={activeLayout}
              brand={brand}
              logo={logo}
              logoLayout={logoLayout}
              headline={shown.headline}
              links={activeLinks}
              cta={activeCta}
              transparent={transparent}
              colors={colors}
            />
          </div>
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

  if (shown.kind === "email") {
    // Each style as the email her students get, rendered by the email engine at
    // its 600 px width and scaled into the card. Sandboxed: no scripts, no clicks.
    // The window shows about 1120 px of it: a whole sample, photo and offer included.
    return (
      <div className="mt-8 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {shown.options.map((o, i) => (
          <CardButton
            key={o.value}
            picked={isPicked(o.value, o.label)}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
            style={enter(i)}
            className="overflow-hidden p-0"
          >
            <span className="relative block h-[615px] overflow-hidden bg-white sm:h-[540px]">
              <iframe
                title={`${o.label} email`}
                srcDoc={o.html}
                sandbox=""
                tabIndex={-1}
                className="pointer-events-none absolute left-0 top-0 h-[1400px] w-[600px] origin-top-left scale-[0.55] border-0 sm:scale-[0.48]"
              />
            </span>
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
                className="flex aspect-square w-full items-center justify-center p-[16%]"
                style={{ color: markColor }}
              >
                <LogoMarkSvg
                  mark={o.mark}
                  label={o.label}
                  className="max-h-full w-full"
                />
              </span>
            ) : o.tint && o.image_url && markColor ? (
              <span
                className="flex aspect-square w-full items-center justify-center p-[10%]"
                style={{ color: markColor }}
              >
                <TintedMark
                  src={o.image_url}
                  gain={o.tint}
                  label={o.label}
                  className="h-full w-full"
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
            {/* Her name under the mark: the lockup her header will show. */}
            <span
              className="mt-2 block truncate text-center text-[13px] font-semibold"
              style={{ color: shown.brand ? markColor : undefined }}
              title={o.label}
            >
              {shown.brand || o.label}
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
        <UploadTile
          picked={
            chosen ? chosen.startsWith("upload:") : isPicked("", UPLOADED)
          }
          disabled={disabled}
          onPick={onPick}
          style={enter(shown.options.length + 1)}
        />
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

/** "Upload my own": her file goes to the media library and becomes the
 * pick, shown in the tile once it is up. */
function UploadTile({
  picked,
  disabled,
  onPick,
  style,
}: {
  picked: boolean;
  disabled?: boolean;
  onPick: (value: string, label: string) => void;
  style?: React.CSSProperties;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const { run: upload, loading } = useAsyncAction(
    async (file: File) => {
      try {
        const { photo_id, signed_url } = await uploadImage(file);
        setSrc(signed_url);
        onPick(`upload:${photo_id}`, UPLOADED);
      } finally {
        if (input.current) input.current.value = "";
      }
    },
    { errorToast: "Couldn’t upload your logo. Try again." },
  );
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <CardButton
        picked={picked}
        disabled={disabled || loading}
        onClick={() => input.current?.click()}
        style={style}
        className="p-3"
      >
        <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--sf-tint)]">
          {loading ? (
            <Spinner className="text-[var(--sf-brass)]" />
          ) : src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={UPLOADED}
              className="max-h-full w-full object-contain p-[12%]"
            />
          ) : (
            <Upload className="size-8 text-[var(--sf-graphite)]" aria-hidden />
          )}
        </span>
        <span className="mt-2 block text-center text-[13px]">
          {loading ? "Uploading…" : "Upload my own"}
        </span>
      </CardButton>
    </>
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
        className="sf-shell fixed inset-0 z-[60] flex flex-col p-3 backdrop-blur-sm motion-safe:animate-fade-in sm:p-6"
        onClick={onClose}
      >
        <div
          className="mx-auto flex w-full max-w-[1400px] shrink-0 flex-col items-start gap-3 pb-3 text-white sm:flex-row sm:items-center sm:justify-between"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="text-[15px] font-semibold sm:truncate">
              {look.label}
            </p>
            {(look.recommended && look.reason) || look.detail ? (
              <p className="text-[13px] text-white/70 sm:truncate">
                {look.recommended && look.reason ? look.reason : look.detail}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
  checkClassName = "right-3 top-3",
  children,
}: {
  picked: boolean;
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  /** Where the picked tick sits (top-right unless the picture is busy there). */
  checkClassName?: string;
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
          className={cn(
            "absolute flex size-5 items-center justify-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)]",
            checkClassName,
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
