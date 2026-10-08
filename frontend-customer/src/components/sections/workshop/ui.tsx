/** Workshop building blocks: The Maker's Bench
 *  Kraft paper, indigo thread, handwritten margin notes in Caveat,
 *  washi tape accents, polaroid prints, stitched seams, and craft price tags.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Img, Txt, has, imageUrl } from "../kit";

/** Inner measure every workshop section aligns to. */
export const WRAP = "mx-auto w-full max-w-[78rem] px-5 md:px-8";

/** Alegreya display typography. Size placed before leading on purpose. */
export const H1 =
  "font-display font-bold text-balance break-words tracking-[-0.02em] text-[clamp(2.6rem,1.3rem+4.8vw,6rem)] leading-[1.02]";
export const H2 =
  "font-display font-bold text-balance break-words tracking-[-0.015em] text-[clamp(1.9rem,1.4rem+2.1vw,3.5rem)] leading-[1.06]";
export const H3 = "font-display font-bold text-balance break-words";

/** Handwritten note styling in Caveat. */
export const HAND = "workshop-hand text-accent";

/** Tabular figures. */
export const NUM = "workshop-tnum";

/** Indigo thread button with stitched border. */
export const BTN =
  "workshop-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-6 py-3 text-[1rem] font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md border border-dashed border-[color-mix(in_oklch,var(--primary-foreground)_40%,transparent)]";

/** Dashed outlined button for secondary actions. */
export const BTN_GHOST =
  "workshop-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 border-dashed border-primary px-6 py-3 text-[1rem] font-bold text-primary transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]";

/** Paper button on the inverse indigo band. */
export const BTN_ON_INK =
  "workshop-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-6 py-3 text-[1rem] font-bold text-[color:var(--inverse)] border-2 border-dashed border-[color:var(--inverse)] transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

/** Base workshop card with paper texture. */
export const CARD =
  "workshop-seam relative rounded-[var(--radius)] border border-border bg-card";

type Tone = "kraft" | "lined" | "inverse" | "plain";

const TONES: Record<Tone, string> = {
  kraft: "workshop-kraft bg-background text-foreground",
  lined: "workshop-kraft workshop-lined bg-background text-foreground",
  inverse: "workshop-inverse",
  plain: "bg-background text-foreground",
};

export function Section({
  tone = "kraft",
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
        "workshop relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Washi tape strip holding elements to the kraft board. */
export function WashiTape({
  className,
  tone = "accent",
}: {
  className?: string;
  tone?: "accent" | "primary" | "muted";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-20 h-5 w-16 sm:h-6 sm:w-20",
        tone === "accent" && "workshop-tape",
        tone === "primary" && "workshop-tape-primary",
        tone === "muted" && "workshop-tape-muted",
        className,
      )}
    />
  );
}

/** Polaroid photo frame with wider bottom, subtle rotation, and optional Caveat caption. */
export function Polaroid({
  image,
  alt = "",
  caption,
  className,
  imgClassName,
  priority,
  tape = true,
  tapePosition = "top-center",
}: {
  image: unknown;
  alt?: string;
  caption?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  tape?: boolean;
  tapePosition?: "top-center" | "top-left" | "top-right";
}) {
  const tapeClasses = {
    "top-center": "-top-3 left-1/2 -translate-x-1/2 rotate-[-2deg]",
    "top-left": "-top-3 -left-3 rotate-[-12deg]",
    "top-right": "-top-3 -right-3 rotate-[12deg]",
  };

  return (
    <figure
      className={cn(
        "workshop-polaroid relative p-3 pb-7 sm:p-4 sm:pb-9 rounded-sm",
        className,
      )}
    >
      {tape && <WashiTape className={tapeClasses[tapePosition]} />}
      <Img
        value={image}
        alt={alt}
        priority={priority}
        className={cn("aspect-[4/5] w-full rounded-[2px]", imgClassName)}
      />
      {caption && (
        <figcaption className="workshop-hand mt-3 text-center text-[1.15rem] leading-none text-accent">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Hand-drawn sketchy arrow for notes and links. */
export function HandArrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 14"
      className={cn("workshop-arrow h-3.5 w-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 7c5-1.5 12-2 22 0M18 2c2 2 5 4.5 6 5-1.5 1-4 3.5-6 5.5" />
    </svg>
  );
}

/** Handwritten kicker in Caveat with a slight playful tilt. */
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
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="p"
        placeholder="Kicker"
        className="workshop-hand text-[1.25rem] font-bold leading-none text-accent rotate-[-1.5deg]"
      />
    </div>
  );
}

/** Standard section opener: handwritten kicker, display heading, and intro. */
export function Opener({
  block,
  editable,
  field = "intro",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-y-6 lg:grid-cols-12 lg:gap-x-10", className)}>
      <div className="lg:col-span-7">
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(H2, "mt-2 block max-w-[20ch]")}
        />
      </div>
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="block max-w-[44ch] self-end text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground lg:col-span-4 lg:col-start-9"
        />
      )}
    </div>
  );
}

/** Craft tag with punched hole circle and price/label. */
export function PriceTag({
  price,
  className,
}: {
  price: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("workshop-tag shadow-xs", className)}>
      <span className="workshop-tag-hole" aria-hidden="true" />
      <span>{price}</span>
    </span>
  );
}

/** Format monetary values: "49.00" + "USD" -> "$49". */
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

/** Text of a block field as a plain string. */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
