/**
 * Sanctum building blocks shared by every sanctum section:
 * The Temple of the Stars — midnight indigo, fine gold line-art,
 * zodiac rings, moon phases, and quiet ceremonial poise.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every sanctum section aligns to. */
export const WRAP = "mx-auto w-full max-w-[76rem] px-5 md:px-8";

/** Headline display sizes in Cinzel (uppercase, tracked). */
export const H1 =
  "font-display font-medium uppercase tracking-[0.06em] text-balance break-words text-[clamp(2.4rem,1.4rem+4.2vw,4.8rem)] leading-[1.08]";
export const H2 =
  "font-display font-medium uppercase tracking-[0.06em] text-balance break-words text-[clamp(1.8rem,1.3rem+2vw,3.2rem)] leading-[1.12]";
export const H3 =
  "font-display font-medium uppercase tracking-[0.05em] text-balance break-words";

/** Tiny tracked caps in primary gold. */
export const LABEL =
  "text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-primary";

/** Tabular figures for prices and numbers. */
export const NUM = "sanctum-tnum";

/** Roman numerals for paths and steps. */
export const ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

/** Primary gold action button with visible 3px focus ring. */
export const BTN =
  "sanctum-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-7 py-3 font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] text-primary-foreground transition-transform duration-300 motion-safe:hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--primary)_88%,var(--foreground))]";

/** Ghost gold outline button. */
export const BTN_GHOST =
  "sanctum-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border border-primary px-7 py-3 font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] text-primary transition-colors duration-300 hover:bg-[color-mix(in_oklch,var(--primary)_15%,transparent)]";

/** Luminous button for the inverse band. */
export const BTN_ON_LUMINOUS =
  "sanctum-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-7 py-3 font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] text-primary-foreground transition-transform duration-300 motion-safe:hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--primary)_88%,var(--foreground))]";

type Tone = "temple" | "surface" | "luminous";

const TONES: Record<Tone, string> = {
  temple: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  luminous:
    "sanctum-luminous bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "temple",
  stars = true,
  className,
  children,
  label,
}: {
  tone?: Tone;
  stars?: boolean;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label || undefined}
      className={cn(
        "sanctum relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        stars && tone !== "luminous" && "sanctum-starfield",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker: tracked caps with gold accent. */
export function Kicker({
  block,
  editable,
  className,
}: {
  block: Block;
  editable?: EditableContext;
  className?: string;
}) {
  if (!has(block, "kicker", editable)) return null;
  return (
    <Txt
      block={block}
      field="kicker"
      editable={editable}
      as="p"
      placeholder="Kicker"
      className={cn(LABEL, className)}
    />
  );
}

/** 4-point celestial star glyph. */
export function StarGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("size-3.5 shrink-0 text-primary", className)}
    >
      <path d="M12 1L14.2 9.8L23 12L14.2 14.2L12 23L9.8 14.2L1 12L9.8 9.8Z" />
    </svg>
  );
}

/** Single moon phase glyph (0 to 4). */
export function MoonGlyph({
  phase = 2,
  className,
}: {
  phase?: number;
  className?: string;
}) {
  const norm = ((phase % 5) + 5) % 5;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0 text-primary", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      {/* Outer circle */}
      <circle cx="12" cy="12" r="9" />
      {/* Phases */}
      {norm === 0 && (
        // Waxing Crescent
        <path d="M12 3 A9 9 0 0 1 12 21 A6 9 0 0 0 12 3" fill="currentColor" />
      )}
      {norm === 1 && (
        // First Quarter
        <path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor" />
      )}
      {norm === 2 && (
        // Full Moon
        <circle cx="12" cy="12" r="7.5" fill="currentColor" />
      )}
      {norm === 3 && (
        // Last Quarter
        <path d="M12 3 A9 9 0 0 0 12 21 Z" fill="currentColor" />
      )}
      {norm === 4 && (
        // Waning Crescent
        <path d="M12 3 A9 9 0 0 0 12 21 A6 9 0 0 1 12 3" fill="currentColor" />
      )}
    </svg>
  );
}

/** Row of 5 moon phases used as a celestial divider. */
export function MoonPhases({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center gap-3 opacity-80",
        className,
      )}
    >
      <span className="h-px w-6 bg-[color-mix(in_oklch,var(--primary)_30%,transparent)]" />
      <MoonGlyph phase={0} className="size-3" />
      <MoonGlyph phase={1} className="size-3.5" />
      <MoonGlyph phase={2} className="size-4" />
      <MoonGlyph phase={3} className="size-3.5" />
      <MoonGlyph phase={4} className="size-3" />
      <span className="h-px w-6 bg-[color-mix(in_oklch,var(--primary)_30%,transparent)]" />
    </div>
  );
}

/** Decorative Zodiac Ring with concentric tick marks and celestial stars. */
export function ZodiacRing({
  className,
  size = 500,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute select-none text-[color-mix(in_oklch,var(--primary)_30%,transparent)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 400 400"
        fill="none"
        stroke="currentColor"
        className="size-full sanctum-spin-slow"
      >
        {/* Outer Ring */}
        <circle cx="200" cy="200" r="195" strokeWidth="0.75" />
        <circle
          cx="200"
          cy="200"
          r="185"
          strokeWidth="0.5"
          strokeDasharray="2 6"
        />
        <circle cx="200" cy="200" r="160" strokeWidth="0.75" />
        <circle
          cx="200"
          cy="200"
          r="130"
          strokeWidth="0.5"
          strokeDasharray="1 5"
        />
        <circle cx="200" cy="200" r="100" strokeWidth="0.75" />
        <circle cx="200" cy="200" r="60" strokeWidth="0.5" />

        {/* 12 Zodiac Radiating Rays and Degree Marks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const x1 = 200 + 160 * Math.cos(angle);
          const y1 = 200 + 160 * Math.sin(angle);
          const x2 = 200 + 195 * Math.cos(angle);
          const y2 = 200 + 195 * Math.sin(angle);
          const dotX = 200 + 172.5 * Math.cos(angle + (15 * Math.PI) / 180);
          const dotY = 200 + 172.5 * Math.sin(angle + (15 * Math.PI) / 180);

          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.75" />
              <circle cx={dotX} cy={dotY} r="2" fill="currentColor" />
            </g>
          );
        })}

        {/* 4 Cardinal Crosshair Stars */}
        <path
          d="M200 40 L200 70 M200 330 L200 360 M40 200 L70 200 M330 200 L360 200"
          strokeWidth="1"
        />
        {/* Center Star */}
        <path
          d="M200 180 L204 196 L220 200 L204 204 L200 220 L196 204 L180 200 L196 196 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

/** Ornate Gold Frame container with corner notch ornaments. */
export function GoldFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative border border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[color-mix(in_oklch,var(--surface)_40%,transparent)] p-6 md:p-10",
        className,
      )}
    >
      {/* 4 Corner Ornaments */}
      <span
        aria-hidden="true"
        className="absolute -left-1.5 -top-1.5 size-3 border-l border-t border-primary"
      />
      <span
        aria-hidden="true"
        className="absolute -right-1.5 -top-1.5 size-3 border-r border-t border-primary"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 -left-1.5 size-3 border-b border-l border-primary"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 -right-1.5 size-3 border-b border-r border-primary"
      />
      {children}
    </div>
  );
}

/** 6 Mystical Sigil Glyphs for Benefits and Rituals. */
export function SigilIcon({
  index = 0,
  className,
}: {
  index?: number;
  className?: string;
}) {
  const norm = index % 6;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      className={cn("size-10 shrink-0 text-primary", className)}
      strokeWidth="1.2"
    >
      {norm === 0 && (
        // Sigil 1: Celestial Sunburst
        <>
          <circle cx="24" cy="24" r="8" />
          <circle cx="24" cy="24" r="14" strokeDasharray="2 4" />
          <path d="M24 4V12M24 36V44M4 24H12M36 24H44M10 10L16 16M32 32L38 38M10 38L16 32M32 16L38 10" />
          <circle cx="24" cy="24" r="3" fill="currentColor" />
        </>
      )}
      {norm === 1 && (
        // Sigil 2: Eye of Intuition / Vision
        <>
          <path d="M6 24C6 24 13 13 24 13C35 13 42 24 42 24C42 24 35 35 24 35C13 35 6 24 6 24Z" />
          <circle cx="24" cy="24" r="6" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" />
          <path d="M24 5V9M24 39V43M16 8L18 11M32 8L30 11" />
        </>
      )}
      {norm === 2 && (
        // Sigil 3: Sacred Geometry / Diamond Portal
        <>
          <rect
            x="12"
            y="12"
            width="24"
            height="24"
            transform="rotate(45 24 24)"
          />
          <circle cx="24" cy="24" r="16" />
          <circle cx="24" cy="24" r="6" strokeDasharray="1 3" />
          <path d="M24 8V40M8 24H40" />
          <circle cx="24" cy="24" r="2" fill="currentColor" />
        </>
      )}
      {norm === 3 && (
        // Sigil 4: Triple Moon / Goddess
        <>
          <circle cx="24" cy="24" r="8" />
          <path
            d="M16 14A12 12 0 0 0 16 34A10 10 0 0 1 16 14"
            fill="currentColor"
            opacity="0.3"
          />
          <path d="M16 14A12 12 0 0 0 16 34" />
          <path
            d="M32 14A12 12 0 0 1 32 34A10 10 0 0 0 32 14"
            fill="currentColor"
            opacity="0.3"
          />
          <path d="M32 14A12 12 0 0 1 32 34" />
          <path d="M24 6V10M24 38V42" />
        </>
      )}
      {norm === 4 && (
        // Sigil 5: Mystic Chalice / Grail
        <>
          <path d="M14 10H34C34 10 34 24 24 28C14 24 14 10 14 10Z" />
          <path d="M24 28V38M16 38H32" />
          <path d="M12 16H36" strokeDasharray="2 3" />
          <circle cx="24" cy="18" r="3" fill="currentColor" />
          <path
            d="M24 4L25 7L28 8L25 9L24 12L23 9L20 8L23 7Z"
            fill="currentColor"
          />
        </>
      )}
      {norm === 5 && (
        // Sigil 6: 8-Pointed Star of Ishtar
        <>
          <path d="M24 6L26.5 17.5L38 20L26.5 22.5L24 34L21.5 22.5L10 20L21.5 17.5Z" />
          <path
            d="M13 13L20 18M35 13L28 18M35 35L28 30M13 35L20 30"
            strokeDasharray="1 3"
          />
          <circle cx="24" cy="20" r="16" />
          <circle cx="24" cy="20" r="3" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** Standard section opener, centred by default with moon phases. */
export function Opener({
  block,
  editable,
  field = "intro",
  align = "center",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  align?: "center" | "left";
  className?: string;
}) {
  const centred = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col",
        centred && "items-center text-center",
        className,
      )}
    >
      <Kicker block={block} editable={editable} />
      <MoonPhases className="mt-3.5" />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(H2, "mt-4 block max-w-[20ch]")}
      />
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="mt-6 block max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.7] text-muted-foreground"
        />
      )}
    </div>
  );
}

/** Currency and money formatter. */
export function money(price: string, currency: string) {
  const n = Number(price);
  if (!Number.isFinite(n)) return `${price} ${currency}`;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: n % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n % 1 ? n.toFixed(2) : n} ${currency}`;
  }
}

/** Safe string converter for block fields. */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
