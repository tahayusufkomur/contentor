/** Maison building blocks shared by every maison section: a fashion house
 *  lookbook — ivory, black, a huge high-contrast Bodoni, hairline frames,
 *  tracked small caps, and a great deal of air. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every maison section aligns to. */
export const WRAP = "mx-auto w-full max-w-[80rem] px-5 md:px-8";

/** Bodoni display sizes. Size before leading on purpose (tailwind-merge
 *  drops a leading-* that precedes a text-* size). */
export const H1 =
  "maison-opsz font-display font-normal text-balance break-words tracking-[-0.01em] text-[clamp(2.9rem,1.3rem+6vw,7.5rem)] leading-[0.95]";
export const H2 =
  "maison-opsz font-display font-normal text-balance break-words tracking-[-0.005em] text-[clamp(2rem,1.45rem+2.4vw,3.9rem)] leading-[1.02]";
export const H3 = "font-display font-normal text-balance break-words";

/** Tracked small caps: the caption voice of the house. */
export const LABEL = "text-[0.68rem] font-normal uppercase tracking-[0.28em]";

/** Tabular figures. */
export const NUM = "maison-tnum";

/** Hairline-outlined button (primary action): tracked caps, no fill. */
export const BTN =
  "maison-focus inline-flex min-h-12 items-center justify-center gap-3 border border-foreground px-7 py-3 text-[0.68rem] font-normal uppercase tracking-[0.28em] transition-colors duration-300 hover:bg-foreground hover:text-background";

/** Filled black button for the one place a fill is wanted. */
export const BTN_SOLID =
  "maison-focus inline-flex min-h-12 items-center justify-center gap-3 bg-primary px-7 py-3 text-[0.68rem] font-normal uppercase tracking-[0.28em] text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Ivory outlined button on the black band. */
export const BTN_ON_BLACK =
  "maison-focus inline-flex min-h-12 items-center justify-center gap-3 border border-[var(--inverse-foreground)] px-7 py-3 text-[0.68rem] font-normal uppercase tracking-[0.28em] text-[color:var(--inverse-foreground)] transition-colors duration-300 hover:bg-[var(--inverse-foreground)] hover:text-[color:var(--inverse)]";

/** The hairline frame around a photograph. */
export const FRAME = "maison-frame border border-foreground p-2.5 sm:p-3";

type Tone = "ivory" | "surface" | "black";

const TONES: Record<Tone, string> = {
  ivory: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  black:
    "maison-black bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "ivory",
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
        "maison relative w-full py-24 md:py-32 lg:py-40",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a tracked caps line in the muted ink. */
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
      className={cn(LABEL, "text-muted-foreground", className)}
    />
  );
}

/** A caption line under a plate: tracked caps, centred. */
export function Caption({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(LABEL, "mt-4 text-center text-muted-foreground", className)}
    >
      {children}
    </p>
  );
}

/** Roman numeral for "the edit". */
export function roman(i: number) {
  const n = i + 1;
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

/** Standard section opener, centred: kicker, heading, intro, with a short
 *  hairline beneath. */
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
        className={cn(H2, "mt-5 block max-w-[20ch]")}
      />
      <span
        aria-hidden="true"
        className={cn(
          "mt-7 block h-px w-10 bg-foreground",
          !centred && "mr-auto",
        )}
      />
      {field && (
        <Txt
          block={block}
          field={field}
          editable={editable}
          as="p"
          placeholder="Intro"
          className="mt-7 block max-w-[44ch] text-pretty text-[1.02rem] font-light leading-[1.7] text-muted-foreground"
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
      className={cn("maison-arrow h-3 w-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M0 6h22M17 1l5 5-5 5" />
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

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
