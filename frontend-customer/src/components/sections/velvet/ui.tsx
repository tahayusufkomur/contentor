/** Velvet building blocks shared by every velvet section: oxblood and
 *  near-black with a blush light and champagne hairlines — Playfair italic
 *  for the voice, Jost for the small print, tracked capitals on rectangular
 *  satin buttons, tall portraits behind a fine offset line and a vignette,
 *  and one blush band where the room lights up. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every velvet section aligns to (narrow: a private room). */
export const WRAP = "mx-auto w-full max-w-[78rem] px-5 md:px-8";

/** Italic display sizes. Size before leading on purpose (tailwind-merge
 *  drops a leading-* that precedes a text-* size). */
export const H1 =
  "velvet-it font-display font-normal text-balance break-words tracking-[-0.015em] text-[clamp(2.7rem,1.4rem+5vw,6.5rem)] leading-[1.0]";
export const H2 =
  "velvet-it font-display font-normal text-balance break-words tracking-[-0.01em] text-[clamp(2rem,1.45rem+2.3vw,3.7rem)] leading-[1.08]";
export const H3 =
  "font-display font-normal text-balance break-words tracking-[-0.005em]";

/** Small tracked label in champagne (the kicker's voice). */
export const LABEL =
  "text-[0.75rem] font-medium uppercase tracking-[0.3em] text-accent";

/** Tabular figures for clock times and prices. */
export const NUM = "velvet-tnum";

/** The satin button: blush with a sheen that slides across on hover. */
export const BTN =
  "velvet-sheen velvet-focus inline-flex min-h-12 items-center justify-center rounded-[2px] px-8 py-3.5 text-[0.76rem] font-medium uppercase tracking-[0.22em] text-primary-foreground";

/** Quiet second action: a champagne hairline. */
export const BTN_GHOST =
  "velvet-focus inline-flex min-h-12 items-center justify-center rounded-[2px] border border-accent px-8 py-3.5 text-[0.76rem] font-medium uppercase tracking-[0.22em] text-accent transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Oxblood button for the blush band. */
export const BTN_ON_CREAM =
  "velvet-focus inline-flex min-h-12 items-center justify-center rounded-[2px] bg-[var(--inverse-foreground)] px-8 py-3.5 text-[0.76rem] font-medium uppercase tracking-[0.22em] text-[color:var(--inverse)] transition-opacity duration-300 hover:opacity-85";

/** A chip: time, format, level. */
export const CHIP =
  "inline-flex items-center gap-2 rounded-full border border-accent/40 px-3.5 py-1.5 text-[0.78rem] uppercase tracking-[0.14em] text-muted-foreground";

type Tone = "night" | "surface" | "cream";

const TONES: Record<Tone, string> = {
  night: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  cream:
    "velvet-cream bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "night",
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
        "velvet relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker: a small tracked champagne line. */
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

/** Standard section opener, centred: kicker, heading, intro. `field` names
 *  the intro field; null for none. */
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
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(H2, "mt-4 block max-w-[18ch]")}
      />
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="mt-6 block max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
        />
      )}
    </div>
  );
}

/** A photograph behind a fine offset line, shaded at the foot. */
export const FRAME = "velvet-frame";

/** Candlelight: a warm rose glow behind whatever it wraps. */
export function Halo({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("velvet-halo relative", className)}>{children}</div>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("velvet-arrow h-3 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6h21M17 1l5 5-5 5" />
    </svg>
  );
}

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
