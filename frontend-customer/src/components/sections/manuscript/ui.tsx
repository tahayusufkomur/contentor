/**
 * Manuscript building blocks shared by every manuscript section:
 * The book — cream pages, light literary serif, drop caps, chapter numerals,
 * double hairline rules, fleuron ornaments, and long-form reading rhythm.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every manuscript section aligns to. */
export const WRAP = "mx-auto w-full max-w-[76rem] px-5 md:px-8";

/** Prose measure for comfortable reading (38-42rem). */
export const MEASURE = "mx-auto w-full max-w-[42rem]";

/** Serif display sizes (Spectral). Size before leading on purpose. */
export const H1 =
  "font-display font-light text-balance break-words tracking-[-0.01em] text-[clamp(2.4rem,1.3rem+4.4vw,5.5rem)] leading-[1.04]";
export const H2 =
  "font-display font-normal text-balance break-words tracking-[-0.01em] text-[clamp(1.85rem,1.35rem+2vw,3.2rem)] leading-[1.12]";
export const H3 = "font-display font-normal text-balance break-words";

/** Small caps label with literary tracking. */
export const LABEL =
  "manuscript-small-caps text-[0.82rem] font-medium tracking-[0.12em] text-accent";

/** Tabular figures for prices, dates, page numbers. */
export const NUM = "manuscript-tnum";

/** Primary action button: quiet bookish refinement. */
export const BTN =
  "manuscript-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-7 py-3 text-[0.92rem] font-medium text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Ghost button for secondary action: thin hairline border. */
export const BTN_GHOST =
  "manuscript-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border border-border bg-transparent px-7 py-3 text-[0.92rem] font-medium text-foreground transition-colors duration-300 hover:border-foreground hover:bg-[color-mix(in_oklch,var(--foreground)_4%,transparent)]";

/** Action button on inverse background. */
export const BTN_ON_INVERSE =
  "manuscript-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-7 py-3 text-[0.92rem] font-medium text-[color:var(--inverse)] transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Roman numeral converter (1 -> I, 2 -> II, 3 -> III, ...). */
const ROMANS = [
  "",
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
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
];

export function toRoman(n: number): string {
  if (n >= 1 && n < ROMANS.length) return ROMANS[n];
  return String(n);
}

/** Fleuron ornament (❦) as a divider. */
export function Fleuron({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block select-none font-normal text-accent",
        className,
      )}
    >
      ❦
    </span>
  );
}

/** Double hairline rule (border-top 3px double). */
export function DoubleRule({ className }: { className?: string }) {
  return (
    <hr
      aria-hidden="true"
      className={cn("manuscript-double-rule my-8 border-0", className)}
    />
  );
}

/** Running head: centred small-caps line with hairlines either side. */
export function RunningHead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-px flex-1 max-w-[3rem] bg-border sm:max-w-[4rem]"
      />
      <span className={cn(LABEL, "shrink-0 uppercase")}>{children}</span>
      <span
        aria-hidden="true"
        className="h-px flex-1 max-w-[3rem] bg-border sm:max-w-[4rem]"
      />
    </div>
  );
}

/** The kicker as a running head. */
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
    <RunningHead className={className}>
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="span"
        placeholder="Kicker"
      />
    </RunningHead>
  );
}

type Tone = "paper" | "surface" | "inverse";

const TONES: Record<Tone, string> = {
  paper: "bg-background text-foreground",
  surface:
    "bg-[color-mix(in_oklch,var(--surface)_65%,var(--background))] text-foreground",
  inverse:
    "manuscript-inverse bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
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
        "manuscript relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Standard section opener: centred running head, heading, fleuron, and intro. */
export function Opener({
  block,
  editable,
  field = "intro",
  className,
  align = "center",
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  className?: string;
  align?: "center" | "split";
}) {
  if (align === "split") {
    return (
      <div
        className={cn("grid gap-y-6 lg:grid-cols-12 lg:gap-x-10", className)}
      >
        <div className="lg:col-span-7">
          <Kicker block={block} editable={editable} className="justify-start" />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-3 block max-w-[22ch]")}
          />
        </div>
        {field && has(block, field, editable) && (
          <Txt
            block={block}
            field={field}
            editable={editable}
            as="p"
            placeholder="Intro"
            className="block max-w-[42ch] self-end text-pretty text-[1.05rem] leading-[1.75] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("mx-auto max-w-[42rem] text-center", className)}>
      <Kicker block={block} editable={editable} />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(H2, "mt-4 block")}
      />
      {field && has(block, field, editable) && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="mt-4 block text-pretty text-[1.05rem] leading-[1.75] text-muted-foreground"
        />
      )}
      <div className="mt-5 flex justify-center">
        <Fleuron />
      </div>
    </div>
  );
}

/** A dotted leader row: label left, dotted rule, value right. */
export function Leader({
  left,
  right,
  className,
}: {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <span className="min-w-0 shrink">{left}</span>
      <span
        aria-hidden="true"
        className="manuscript-dots min-w-[2rem] flex-1 translate-y-[-0.25em] self-end"
      />
      <span className={cn(NUM, "shrink-0 text-muted-foreground")}>{right}</span>
    </div>
  );
}

/** Arrow ornament for links. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("h-3 w-5 shrink-0", className)}
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

/** Text of a block field as a plain string. */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
