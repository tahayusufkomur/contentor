/** Encore building blocks shared by every encore section: a gig poster and
 *  the record it sells — cream stock, black ink, a teal second colour, wide
 *  heavy type stacked like a lineup, 3px rules, stars for dividers, and a
 *  tracklist wherever other styles put a list. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every encore section aligns to. */
export const WRAP = "mx-auto w-full max-w-[88rem] px-5 md:px-8";

/** The lineup voice: Unbounded, black weight, caps, tight. Size before
 *  leading on purpose (tailwind-merge drops a leading-* that precedes a
 *  text-* size). */
export const DISPLAY =
  "font-display font-black uppercase text-balance break-words tracking-[-0.03em] leading-[0.95]";
export const H1 = cn(
  DISPLAY,
  "text-[clamp(2.2rem,1rem+4.8vw,6rem)] leading-[0.95]",
);
export const H2 = cn(
  DISPLAY,
  "text-[clamp(1.7rem,1.15rem+2.2vw,3.6rem)] leading-[0.98]",
);
export const H3 =
  "font-display font-bold text-balance break-words tracking-[-0.02em]";

/** Mono caps: track numbers, durations, dates, column titles. */
export const LABEL =
  "encore-mono text-[0.72rem] font-bold uppercase tracking-[0.1em]";

/** Tabular figures. */
export const NUM = "encore-tnum";

/** Ink bar button (primary action) — Unbounded caps. */
export const BTN =
  "encore-focus inline-flex min-h-12 items-center justify-center gap-3 bg-primary px-6 py-3 font-display text-[0.78rem] font-bold uppercase tracking-[0.04em] text-primary-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

/** Teal bar for the second action. */
export const BTN_ACCENT =
  "encore-focus inline-flex min-h-12 items-center justify-center gap-3 border-[3px] border-foreground px-6 py-3 font-display text-[0.78rem] font-bold uppercase tracking-[0.04em] transition-colors duration-200 hover:border-accent hover:bg-accent hover:text-accent-foreground";

/** Cream bar on the ink band. */
export const BTN_ON_INK =
  "encore-focus inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--inverse-foreground)] px-6 py-3 font-display text-[0.78rem] font-bold uppercase tracking-[0.04em] text-[color:var(--inverse)] transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

/** 3px ink rule and the hairline. */
export const RULE = "border-t-[3px] border-foreground";
export const HAIR = "border-t border-foreground";

type Tone = "stock" | "surface" | "ink";

const TONES: Record<Tone, string> = {
  stock: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  ink: "encore-ink bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "stock",
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
        "encore relative w-full py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a mono caps billing line. */
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

/** Star divider: ★ ★ ★ */
export function Stars({ className }: { className?: string }) {
  return (
    <p
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center gap-4 text-[1.1rem] leading-none",
        className,
      )}
    >
      <span>&#9733;</span>
      <span>&#9733;</span>
      <span>&#9733;</span>
    </p>
  );
}

/** A poster box: 3px ink border. */
export const BOX = "border-[3px] border-foreground";

/** Track number ("01") in mono. */
export function Track({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(LABEL, NUM, "shrink-0 text-muted-foreground", className)}
    >
      {children}
    </span>
  );
}

/** Standard section opener: kicker, heading, intro, on a 3px rule. */
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
    <div
      className={cn(
        RULE,
        "grid gap-y-6 pt-5 lg:grid-cols-12 lg:gap-x-10",
        className,
      )}
    >
      <div className="lg:col-span-8">
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(H2, "mt-4 block max-w-[18ch]")}
        />
      </div>
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="block max-w-[42ch] self-end text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground lg:col-span-4 lg:col-start-9"
        />
      )}
    </div>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("encore-arrow size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
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
