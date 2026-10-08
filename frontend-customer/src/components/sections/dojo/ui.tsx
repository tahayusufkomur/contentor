/** Dojo building blocks shared by every dojo section: rice paper, black
 *  sumi ink, one red seal (hanko), disciplined vertical rules, Enso circle,
 *  and belt stripes for progression. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every dojo section aligns to. */
export const WRAP = "mx-auto w-full max-w-[80rem] px-5 sm:px-8 lg:px-12";

/** Shippori Mincho display sizes (weight 800). Size before leading on purpose. */
export const H1 =
  "font-display font-extrabold text-balance break-words tracking-[-0.02em] text-[clamp(2.75rem,1.4rem+5vw,6.5rem)] leading-[0.98]";
export const H2 =
  "font-display font-extrabold text-balance break-words tracking-[-0.015em] text-[clamp(2rem,1.45rem+2.2vw,3.6rem)] leading-[1.04]";
export const H3 =
  "font-display font-bold text-balance break-words tracking-[-0.01em] leading-snug";

/** Small tracked label in accent red / ink. */
export const LABEL =
  "text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent";

/** Tabular figures for ranking and time. */
export const NUM = "dojo-tnum";

/** Solid sumi black button (primary action). */
export const BTN =
  "dojo-focus inline-flex min-h-12 items-center justify-center gap-3 rounded-[var(--radius)] bg-primary px-7 py-3 text-[0.9rem] font-bold tracking-[0.04em] text-primary-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

/** Sharp outlined button for the second action. */
export const BTN_GHOST =
  "dojo-focus inline-flex min-h-12 items-center justify-center gap-3 rounded-[var(--radius)] border border-foreground px-7 py-3 text-[0.9rem] font-bold tracking-[0.04em] text-foreground transition-colors duration-200 hover:border-accent hover:bg-accent hover:text-accent-foreground";

/** Paper button on the sumi ink band. */
export const BTN_ON_INK =
  "dojo-focus inline-flex min-h-12 items-center justify-center gap-3 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-7 py-3 text-[0.9rem] font-bold tracking-[0.04em] text-[color:var(--inverse)] transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

export const BELT_COLORS = [
  "var(--dojo-belt-0)",
  "var(--dojo-belt-1)",
  "var(--dojo-belt-2)",
  "var(--dojo-belt-3)",
  "var(--dojo-belt-4)",
  "var(--dojo-belt-5)",
  "var(--dojo-belt-6)",
];

export const BELT_RANKS = [
  "6th Kyu (White)",
  "5th Kyu (Yellow)",
  "4th Kyu (Orange)",
  "3rd Kyu (Green)",
  "2nd Kyu (Blue)",
  "1st Kyu (Brown)",
  "1st Dan (Black)",
];

export const beltColor = (index: number) =>
  BELT_COLORS[index % BELT_COLORS.length];

export const beltRank = (index: number) =>
  BELT_RANKS[index % BELT_RANKS.length];

/** Thin belt stripe indicator cycling standard belt colours. */
export function BeltStripe({
  index = 0,
  className,
}: {
  index?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-1 w-full shrink-0", className)}
      style={{ backgroundColor: beltColor(index) }}
    />
  );
}

/** Signature Red Seal (Hanko): small solid accent stamp rotated -4deg. */
export function Seal({
  text = "道",
  className,
}: {
  text?: string;
  className?: string;
}) {
  const glyph = text ? text.trim().charAt(0) : "道";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "dojo-seal size-7 font-display text-[0.8rem] font-bold leading-none select-none",
        className,
      )}
    >
      {glyph || "道"}
    </span>
  );
}

/** Partial Enso circle for atmospheric background depth. */
export function Enso({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "dojo-enso size-64 sm:size-80 md:size-96 lg:size-[30rem]",
        className,
      )}
    />
  );
}

type Tone = "rice" | "surface" | "ink";

const TONES: Record<Tone, string> = {
  rice: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  ink: "dojo-ink bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "rice",
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
        "dojo relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Kicker accompanied by a signature Red Seal stamp. */
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
    <div className={cn("flex items-center gap-2.5", className)}>
      <Seal text="道" className="size-5 text-[0.65rem]" />
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="p"
        placeholder="Kicker"
        className={LABEL}
      />
    </div>
  );
}

/** Standard section opener: kicker with seal, heading left, intro right. */
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
    <div className={cn("grid gap-y-6 lg:grid-cols-12 lg:gap-x-12", className)}>
      <div className="lg:col-span-7">
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(H2, "mt-3.5 block max-w-[20ch]")}
        />
      </div>
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="block max-w-[46ch] self-end text-pretty text-[1.05rem] leading-[1.68] text-muted-foreground lg:col-span-5"
        />
      )}
    </div>
  );
}

/** Crisp arrow icon. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("dojo-arrow h-3 w-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M1 6h20M15 1l6 5-6 5" />
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
