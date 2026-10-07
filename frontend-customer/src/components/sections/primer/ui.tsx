/** Primer building blocks shared by every primer section: the exercise book
 *  — ruled lines, a red margin rule, a bookish serif for titles, a face
 *  designed for legibility for everything else, Courier for unit labels,
 *  outcomes as checkboxes, level tabs. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every primer section aligns to. */
export const WRAP = "mx-auto w-full max-w-[78rem] px-5 md:px-8";

/** Serif display sizes (Source Serif). Size before leading on purpose. */
export const H1 =
  "font-display font-semibold text-balance break-words tracking-[-0.015em] text-[clamp(2.6rem,1.3rem+4.8vw,6.2rem)] leading-[1.02]";
export const H2 =
  "font-display font-semibold text-balance break-words tracking-[-0.01em] text-[clamp(1.9rem,1.4rem+2.1vw,3.5rem)] leading-[1.08]";
export const H3 = "font-display font-semibold text-balance break-words";

/** Courier unit label: "Unit 1", "Lesson 3", "p. 12". */
export const LABEL =
  "primer-courier text-[0.8rem] font-bold uppercase tracking-[0.06em]";

/** Tabular figures. */
export const NUM = "primer-tnum";

/** Ink-blue button (primary action). */
export const BTN =
  "primer-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-6 py-3 text-[0.95rem] font-bold text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Pencil-red outlined button for the second action. */
export const BTN_GHOST =
  "primer-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 border-accent px-6 py-3 text-[0.95rem] font-bold text-accent transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Paper button on the ink band. */
export const BTN_ON_INK =
  "primer-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-6 py-3 text-[0.95rem] font-bold text-[color:var(--inverse)] transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

type Tone = "paper" | "ruled" | "ink";

const TONES: Record<Tone, string> = {
  paper: "bg-background text-foreground",
  ruled: "primer-ruled bg-background text-foreground",
  ink: "primer-ink bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
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
        "primer relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a Courier unit label in pencil red. */
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
      className={cn(LABEL, "text-accent", className)}
    />
  );
}

/** The red margin rule with ruled lines: wraps content like a page of the
 *  book (left padding for the margin). */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("primer-page relative pl-8 sm:pl-12", className)}>
      {children}
    </div>
  );
}

/** A checkbox mark: ticked (filled ink) or empty. */
export function Check({
  done,
  className,
}: {
  done?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "primer-check inline-block size-4 shrink-0 border-2 border-primary",
        done && "primer-check-done",
        className,
      )}
    />
  );
}

/** Index tabs ("A1", "A2", "B1") stacked at the page edge. */
export function Tabs({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-col items-end gap-1.5", className)}
    >
      {items.map((t, i) => (
        <span
          key={t}
          className={cn(
            LABEL,
            "primer-tab rounded-l-[var(--radius)] px-3 py-1.5 text-primary-foreground",
          )}
          style={{ opacity: 1 - i * 0.18 }}
        >
          {t}
        </span>
      ))}
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
      className={cn("primer-arrow h-3 w-5 shrink-0", className)}
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
