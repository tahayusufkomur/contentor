/** Ledger building blocks shared by every ledger section: an annual report
 *  set in navy ink on bone — running heads in mono caps between rules, light
 *  serif headlines, lining tabular figures, one oxblood accent. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every ledger section aligns to. */
export const WRAP = "mx-auto w-full max-w-[80rem] px-5 md:px-8";

/** Serif display sizes. Size before leading on purpose (tailwind-merge drops
 *  a leading-* that precedes a text-* size). */
export const H1 =
  "font-display font-normal text-balance break-words tracking-[-0.018em] text-[clamp(2.9rem,1.4rem+5.4vw,7rem)] leading-[0.97]";
export const H2 =
  "font-display font-normal text-balance break-words tracking-[-0.012em] text-[clamp(2.1rem,1.5rem+2.4vw,3.9rem)] leading-[1.04]";
export const H3 = "font-display font-normal text-balance break-words";

/** Mono caps label: clause numbers, running heads, column titles. */
export const LABEL =
  "ledger-mono text-[0.7rem] font-medium uppercase tracking-[0.12em]";

/** Lining tabular figures for anything counted or priced. */
export const NUM = "ledger-tnum";

/** Square ink button (primary action). */
export const BTN =
  "ledger-focus inline-flex min-h-12 items-center justify-center gap-3 bg-primary px-6 py-3 text-[0.95rem] font-medium text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Outlined button for the second action. */
export const BTN_GHOST =
  "ledger-focus inline-flex min-h-12 items-center justify-center gap-3 border border-foreground px-6 py-3 text-[0.95rem] font-medium transition-colors duration-300 hover:border-accent hover:text-accent";

/** Bone button for the navy band. */
export const BTN_ON_NAVY =
  "ledger-focus inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--inverse-foreground)] px-6 py-3 text-[0.95rem] font-medium text-[color:var(--inverse)] transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Heavy rule (ink) and hairline (border). */
export const RULE = "border-t border-foreground";
export const HAIR = "border-t border-border";

type Tone = "bone" | "surface" | "navy";

const TONES: Record<Tone, string> = {
  bone: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  navy: "ledger-navy bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "bone",
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
        "ledger relative w-full py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The running head: the kicker as a mono caps line between a heavy rule and
 *  a hairline, with an optional right-hand mark (a date, a section number).
 *  Every ledger section opens on one — it is the document's page header. */
export function RunningHead({
  block,
  editable,
  right,
  className,
}: {
  block: Block;
  editable?: EditableContext;
  right?: ReactNode;
  className?: string;
}) {
  if (!has(block, "kicker", editable) && !right) return null;
  return (
    <div
      className={cn(
        "ledger-head flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border border-t-current py-2.5",
        LABEL,
        className,
      )}
    >
      <Txt block={block} field="kicker" editable={editable} as="span" />
      {right && <span className="ledger-dim">{right}</span>}
    </div>
  );
}

/** Clause number ("1.", "2.1") set in mono, dimmed. */
export function Ref({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(LABEL, NUM, "ledger-dim shrink-0", className)}
    >
      {children}
    </span>
  );
}

/** "Fig." caption line under a photograph — numbered only where a section
 *  holds several plates, so numbers never jump across a page. */
export function Fig({
  n,
  children,
  className,
}: {
  n?: number | string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        LABEL,
        NUM,
        "ledger-dim mt-3 flex gap-3 border-t border-border pt-2.5",
        className,
      )}
    >
      <span>Fig.{n === undefined ? "" : ` ${n}`}</span>
      {children && (
        <span className="min-w-0 normal-case tracking-normal">{children}</span>
      )}
    </p>
  );
}

/** Thin arrow for "go somewhere" links. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("ledger-arrow h-3 w-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <path d="M0 6h22M17 1l5 5-5 5" />
    </svg>
  );
}

/** Standard section opener: running head, then heading left and intro
 *  right on a 12-column grid. `field` names the intro field (intro / text /
 *  caption); omit it for families without one. */
export function Opener({
  block,
  editable,
  field = "intro",
  right,
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <RunningHead block={block} editable={editable} right={right} />
      <div className="mt-10 grid gap-y-6 md:mt-12 lg:grid-cols-12 lg:gap-x-10">
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(H2, "block max-w-[18ch] lg:col-span-7")}
        />
        {field && (
          <Txt
            block={block}
            field={field}
            editable={editable}
            as="p"
            placeholder="Intro"
            className="block max-w-[44ch] self-end text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        )}
      </div>
    </div>
  );
}

/** "29.00" + "EUR" → { symbol: "€", amount: "29" }. */
export function money(price: string, currency: string) {
  const value = Number(price);
  if (!Number.isFinite(value)) return { symbol: currency, amount: price };
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: value % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).formatToParts(value);
    return {
      symbol: parts.find((p) => p.type === "currency")?.value ?? currency,
      amount: parts
        .filter((p) => p.type !== "currency" && p.type !== "literal")
        .map((p) => p.value)
        .join(""),
    };
  } catch {
    return { symbol: currency, amount: price };
  }
}

export const pad2 = (i: number) => String(i + 1).padStart(2, "0");

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
