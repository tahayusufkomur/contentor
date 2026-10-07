/** Trail building blocks shared by every trail section: a national park
 *  field guide — stone paper with contour lines, pine and blaze orange, a
 *  slab serif, mono labels for distances and elevations, route cards and
 *  stamps for milestones. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every trail section aligns to. */
export const WRAP = "mx-auto w-full max-w-[86rem] px-5 md:px-8";

/** Slab serif display sizes (Zilla Slab 700). Size before leading on
 *  purpose (tailwind-merge drops a leading-* that precedes a text-* size). */
export const H1 =
  "font-display font-bold text-balance break-words tracking-[-0.015em] text-[clamp(2.6rem,1.3rem+4.9vw,6.4rem)] leading-[1.0]";
export const H2 =
  "font-display font-bold text-balance break-words tracking-[-0.01em] text-[clamp(1.9rem,1.4rem+2.1vw,3.5rem)] leading-[1.06]";
export const H3 = "font-display font-bold text-balance break-words";

/** Mono caps: distances, elevations, waypoint numbers, column titles. */
export const LABEL =
  "trail-mono text-[0.7rem] font-medium uppercase tracking-[0.12em]";

/** Tabular figures for distances, durations and prices. */
export const NUM = "trail-tnum";

/** Blaze orange button (primary action). */
export const BTN =
  "trail-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-accent px-6 py-3 text-[0.95rem] font-semibold text-accent-foreground transition-colors duration-200 hover:bg-primary hover:text-primary-foreground";

/** Pine outlined button for the second action. */
export const BTN_GHOST =
  "trail-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 border-foreground px-6 py-3 text-[0.95rem] font-semibold transition-colors duration-200 hover:bg-foreground hover:text-background";

/** Stone button on the pine band. */
export const BTN_ON_PINE =
  "trail-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-6 py-3 text-[0.95rem] font-semibold text-[color:var(--inverse)] transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";

/** A route card: 2px pine border on the stone surface. */
export const CARD =
  "rounded-[var(--radius)] border-2 border-foreground bg-muted";

type Tone = "stone" | "surface" | "pine";

const TONES: Record<Tone, string> = {
  stone: "trail-contours bg-background text-foreground",
  surface: "bg-muted text-foreground",
  pine: "trail-pine bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "stone",
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
        "trail relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a pine mono caps line. */
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
      className={cn(LABEL, "text-primary", className)}
    />
  );
}

/** A route-card stat: big slab figure over a mono caption. */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(NUM, "font-display text-[1.6rem] font-bold leading-none")}
      >
        {value}
      </p>
      <p className={cn(LABEL, "mt-1.5 text-muted-foreground")}>{label}</p>
    </div>
  );
}

/** A round blaze stamp: two-line mono text in a double ring, tilted. */
export function Stamp({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "trail-stamp grid size-[5.5rem] place-items-center rounded-full border-[3px] border-double border-accent p-2 text-center text-accent",
        LABEL,
        "leading-[1.2] tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Waypoint marker: a numbered pine disc. */
export function Waypoint({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "trail-mono flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[0.75rem] font-medium text-primary-foreground",
        className,
      )}
    >
      {n}
    </span>
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
      className={cn("trail-arrow h-3 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
