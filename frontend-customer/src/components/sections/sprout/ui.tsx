/** Sprout building blocks shared by every sprout section: the family room —
 *  cream paper, a round friendly face, chunky colour shapes, organic blob masks,
 *  hand-drawn sprouts, stickers, and wave dividers. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Img, Txt, has, imageUrl } from "../kit";

/** Inner measure every sprout section aligns to. */
export const WRAP = "mx-auto w-full max-w-[78rem] px-5 md:px-8";

/** Fredoka display sizes (weight 600, rounded, friendly). Size before leading. */
export const H1 =
  "font-display font-semibold text-balance break-words tracking-[-0.01em] text-[clamp(2.5rem,1.4rem+4.2vw,5.5rem)] leading-[1.08]";
export const H2 =
  "font-display font-semibold text-balance break-words tracking-[-0.01em] text-[clamp(1.85rem,1.35rem+2vw,3.25rem)] leading-[1.14]";
export const H3 = "font-display font-semibold text-balance break-words";

/** Friendly pill tag for kicker & metadata labels. */
export const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[0.82rem] font-bold leading-normal";

/** Tabular figures. */
export const NUM = "tabular-nums";

/** Primary button: leafy green pill with soft shadow. */
export const BTN =
  "sprout-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-7 py-3 text-[1rem] font-bold text-primary-foreground shadow-[0_4px_16px_color-mix(in_oklch,var(--primary)_30%,transparent)] transition-transform duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";

/** Ghost button: outlined friendly pill. */
export const BTN_GHOST =
  "sprout-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border-2 border-primary bg-transparent px-7 py-3 text-[1rem] font-bold text-primary transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--primary)_12%,transparent)]";

/** Accent button: sunny yellow pill. */
export const BTN_ACCENT =
  "sprout-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-3 text-[1rem] font-bold text-accent-foreground shadow-[0_4px_16px_color-mix(in_oklch,var(--accent)_35%,transparent)] transition-transform duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";

/** Paper button on the inverse band. */
export const BTN_ON_INVERSE =
  "sprout-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--inverse-foreground)] px-7 py-3 text-[1rem] font-bold text-[color:var(--inverse)] shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-transform duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";

/** Chunky soft card. */
export const CARD =
  "rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] p-6 md:p-8 shadow-[0_8px_24px_color-mix(in_oklch,var(--foreground)_4%,transparent)]";

/** Soft tint classes for cycling cards. */
export const TINTS = [
  "bg-[color-mix(in_oklch,var(--surface)_85%,var(--background))]",
  "bg-[color-mix(in_oklch,var(--accent)_18%,var(--surface))]",
  "bg-[color-mix(in_oklch,var(--primary)_12%,var(--surface))]",
  "bg-[color-mix(in_oklch,var(--accent)_14%,var(--background))]",
];

export function getSproutTint(index: number) {
  return TINTS[index % TINTS.length];
}

type Tone = "paper" | "surface" | "inverse";

const TONES: Record<Tone, string> = {
  paper: "bg-background text-foreground",
  surface:
    "bg-[color-mix(in_oklch,var(--surface)_75%,var(--background))] text-foreground",
  inverse:
    "sprout-inverse bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "paper",
  className,
  children,
  label,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label || undefined}
      className={cn(
        "sprout relative w-full overflow-x-clip py-16 md:py-24 lg:py-28",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a friendly rounded pill tag. */
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
    <div className={cn("inline-flex", className)}>
      <span
        className={cn(
          PILL,
          "bg-[color-mix(in_oklch,var(--accent)_30%,transparent)] text-foreground",
        )}
      >
        <SproutDoodle className="size-3.5 text-primary" />
        <Txt
          block={block}
          field="kicker"
          editable={editable}
          as="span"
          placeholder="Kicker"
        />
      </span>
    </div>
  );
}

/** Standard section opener: centered or left. */
export function Opener({
  block,
  editable,
  field = "intro",
  align = "left",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  align?: "left" | "center";
  className?: string;
}) {
  const isCenter = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col",
        isCenter ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <Kicker block={block} editable={editable} />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(
          H2,
          "mt-4 block",
          isCenter ? "max-w-[24ch]" : "max-w-[20ch]",
        )}
      />
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className={cn(
            "mt-4 block max-w-[48ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground",
            isCenter && "mx-auto",
          )}
        />
      )}
    </div>
  );
}

/** Organic Blob Image wrapper with offset colored backing blob. */
export function BlobImage({
  value,
  alt = "",
  variant = 1,
  offsetColor = "accent",
  className,
  priority,
}: {
  value: unknown;
  alt?: string;
  variant?: 1 | 2 | 3;
  offsetColor?: "accent" | "primary";
  className?: string;
  priority?: boolean;
}) {
  const blobClass =
    variant === 1
      ? "sprout-blob-1"
      : variant === 2
        ? "sprout-blob-2"
        : "sprout-blob-3";

  const offsetBg =
    offsetColor === "accent"
      ? "bg-[color-mix(in_oklch,var(--accent)_65%,transparent)]"
      : "bg-[color-mix(in_oklch,var(--primary)_30%,transparent)]";

  return (
    <div className={cn("relative mx-auto w-full max-w-md", className)}>
      {/* Offset organic background shape */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute -inset-3.5 -rotate-3 scale-[1.02] transform transition-transform duration-500 motion-safe:hover:rotate-0",
          blobClass,
          offsetBg,
        )}
      />
      {/* Front photo blob */}
      <Img
        value={value}
        alt={alt}
        priority={priority}
        className={cn(
          "relative aspect-[4/5] w-full overflow-hidden shadow-lg",
          blobClass,
        )}
      />
    </div>
  );
}

/** Round badge sticker rotated ±8deg. */
export function Sticker({
  children,
  rotate = "-6deg",
  className,
}: {
  children: ReactNode;
  rotate?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-accent px-3.5 py-1.5 font-display text-[0.85rem] font-bold text-accent-foreground shadow-md",
        className,
      )}
      style={{ transform: `rotate(${rotate})` }}
    >
      {children}
    </span>
  );
}

/** Curved wave transition divider between sections. */
export function WaveDivider({
  fill = "var(--background)",
  flip,
  className,
}: {
  fill?: string;
  flip?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full overflow-hidden leading-none",
        flip && "rotate-180",
        className,
      )}
    >
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        className="h-8 w-full md:h-12 lg:h-16"
      >
        <path
          d="M0,0 C150,90 350,-40 500,45 C650,130 900,10 1200,40 L1200,120 L0,120 Z"
          style={{ fill }}
        />
      </svg>
    </div>
  );
}

/* =========================================================================
   Doodles: Playful hand-drawn SVGs for warmth and character
   ========================================================================= */

export function SproutDoodle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <path d="M7 20h10" />
      <path d="M12 20v-9" />
      <path
        d="M12 11c0-4 4-7 9-7 0 5-3 9-9 7Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path
        d="M12 13c0-3-3-5-7-5 0 4 2 7 7 5Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
    </svg>
  );
}

export function SunDoodle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.25" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function StarDoodle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("shrink-0", className)}
    >
      <path d="M12 2c.8 4.2 3.8 7.2 8 8-4.2.8-7.2 3.8-8 8-.8-4.2-3.8-7.2-8-8 4.2-.8 7.2-3.8 8-8Z" />
    </svg>
  );
}

export function SquiggleDoodle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <path d="M4 14c12-14 22 14 34 0s22 14 34 0 18 10 24 2" />
    </svg>
  );
}

export function HeartDoodle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("shrink-0", className)}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export function GrowthSproutDoodle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--accent)_30%,var(--surface))] text-primary",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
      >
        <path d="M12 22v-9" />
        <path
          d="M12 13c0-4 4-7 8-7-1 5-4 7-8 7Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
      </svg>
    </div>
  );
}

export function GrowthPlantDoodle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--primary)_18%,var(--surface))] text-primary",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
      >
        <path d="M12 22V8" />
        <path
          d="M12 14c-3-2-6-1-7 2 3 1 6 0 7-2Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
        <path
          d="M12 11c3-2 6-1 7 2-3 1-6 0-7-2Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
        <path
          d="M12 8c0-3 3-5 6-5-1 4-3 5-6 5Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
      </svg>
    </div>
  );
}

export function GrowthTreeDoodle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--accent)_45%,var(--surface))] text-primary",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
      >
        <path d="M12 22v-6" />
        <path
          d="M12 16c-4.4 0-8-3.6-8-8 0-3 2.5-5.5 5.5-5.5 1 0 2 .3 2.5.8.5-.5 1.5-.8 2.5-.8 3 0 5.5 2.5 5.5 5.5 0 4.4-3.6 8-8 8Z"
          fill="currentColor"
          fillOpacity="0.25"
        />
      </svg>
    </div>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        "size-4 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-1",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** "29.00" + "EUR" → "€29". */
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

export const pad2 = (i: number) => String(i + 1).padStart(2, "0");

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
