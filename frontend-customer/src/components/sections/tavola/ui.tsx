/** Tavola building blocks shared by every tavola section: the trattoria —
 *  butter-yellow awning, olive and tomato, a chunky warm serif, menu cards
 *  with ink borders and a hard olive shadow, dotted leaders to every price. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every tavola section aligns to. */
export const WRAP = "mx-auto w-full max-w-[84rem] px-5 md:px-8";

/** Chunky serif display sizes (Young Serif, one weight). Size before
 *  leading on purpose. */
export const H1 =
  "font-display font-normal text-balance break-words tracking-[-0.01em] text-[clamp(2.6rem,1.3rem+4.9vw,6.4rem)] leading-[1.0]";
export const H2 =
  "font-display font-normal text-balance break-words tracking-[-0.005em] text-[clamp(1.9rem,1.4rem+2.1vw,3.5rem)] leading-[1.06]";
export const H3 = "font-display font-normal text-balance break-words";

/** Olive caps label: "This week's menu", "Serves", "Prep". */
export const LABEL =
  "text-[0.76rem] font-bold uppercase tracking-[0.12em] text-primary";

/** Tabular figures for minutes and prices. */
export const NUM = "tavola-tnum";

/** Tomato button (primary action). */
export const BTN =
  "tavola-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-accent px-6 py-3 text-[0.95rem] font-bold text-accent-foreground transition-transform duration-300 motion-safe:hover:-translate-y-0.5";

/** Olive outlined button for the second action. */
export const BTN_GHOST =
  "tavola-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 border-primary px-6 py-3 text-[0.95rem] font-bold text-primary transition-colors duration-300 hover:bg-primary hover:text-primary-foreground";

/** Cream button on the chalkboard band. */
export const BTN_ON_BOARD =
  "tavola-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-6 py-3 text-[0.95rem] font-bold text-[color:var(--inverse)] transition-transform duration-300 motion-safe:hover:-translate-y-0.5";

/** A menu card: cream, 2px ink border, hard olive shadow. */
export const CARD =
  "tavola-card rounded-[var(--radius)] border-2 border-foreground bg-card";

type Tone = "awning" | "cream" | "board";

const TONES: Record<Tone, string> = {
  awning: "bg-background text-foreground",
  cream: "bg-card text-foreground",
  board:
    "tavola-board bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "awning",
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
        "tavola relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as an olive caps label. */
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

/** A dotted leader row: label left, dots, value right — the menu line. */
export function Leader({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="min-w-0 shrink">{label}</span>
      <span
        aria-hidden="true"
        className="tavola-dots min-w-[1.5rem] flex-1 translate-y-[-0.25em] self-end"
      />
      <span className={cn(NUM, "shrink-0 text-muted-foreground")}>{value}</span>
    </div>
  );
}

/** Standard section opener: kicker, heading left, intro right. */
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
          className={cn(H2, "mt-3 block max-w-[20ch]")}
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

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("tavola-arrow h-3 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6h21M17 1l5 5-5 5" />
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
