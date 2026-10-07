/** Darkroom building blocks shared by every darkroom section: a gallery
 *  wall — the work enormous, the words a museum label beside it (Syne for
 *  the title line, mono for the facts), hairlines, one red dot. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every darkroom section aligns to (wide: the wall). */
export const WRAP = "mx-auto w-full max-w-[96rem] px-4 md:px-8";

/** Display sizes (Syne). Size before leading on purpose (tailwind-merge
 *  drops a leading-* that precedes a text-* size). */
export const H1 =
  "font-display font-bold text-balance break-words tracking-[-0.025em] text-[clamp(2.2rem,1.1rem+3.8vw,5rem)] leading-[1.0]";
export const H2 =
  "font-display font-bold text-balance break-words tracking-[-0.02em] text-[clamp(1.7rem,1.25rem+1.9vw,3.1rem)] leading-[1.04]";
export const H3 =
  "font-display font-bold text-balance break-words tracking-[-0.015em]";

/** Mono caps: plate numbers, dates, editions, column titles. */
export const LABEL =
  "darkroom-mono text-[0.68rem] font-medium uppercase tracking-[0.1em]";

/** Black bar button (primary action). */
export const BTN =
  "darkroom-focus inline-flex min-h-12 items-center justify-center gap-3 bg-primary px-6 py-3 text-[0.9rem] font-medium text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Underlined mono caps link (the museum's quiet second action). */
export const LINK =
  "darkroom-link darkroom-mono inline-flex items-center gap-2 text-[0.72rem] font-medium uppercase tracking-[0.1em]";

/** White bar button for the black box band. */
export const BTN_ON_BLACK =
  "darkroom-focus inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--inverse-foreground)] px-6 py-3 text-[0.9rem] font-medium text-[color:var(--inverse)] transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

type Tone = "wall" | "surface" | "black";

const TONES: Record<Tone, string> = {
  wall: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  black:
    "darkroom-black bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "wall",
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
        "darkroom relative w-full py-20 md:py-28 lg:py-36",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The red dot: "sold", "open", "next". */
export function Dot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "darkroom-dot inline-block size-2 rounded-full bg-accent",
        className,
      )}
    />
  );
}

/** The kicker as the label's first mono line (a gallery's room number). */
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

/** A wall label: hairline on top, the title line in Syne, then whatever
 *  facts follow (children), all in a narrow measure. */
export function WallLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "darkroom-label max-w-[34ch] border-t border-foreground pt-3 text-[0.9rem] leading-[1.5]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Plate number ("Plate 3", "No. 04") in mono, dimmed. */
export function Plate({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(LABEL, "darkroom-tnum text-muted-foreground", className)}
    >
      {children}
    </span>
  );
}

/** Standard section opener: kicker, heading left, intro right, on a
 *  hairline. `field` names the intro field; null for none. */
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
        "grid gap-y-6 border-t border-foreground pt-4 lg:grid-cols-12 lg:gap-x-10",
        className,
      )}
    >
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
          className="block max-w-[44ch] self-end text-pretty text-[1rem] leading-[1.6] text-muted-foreground lg:col-span-4 lg:col-start-9"
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
      className={cn("darkroom-arrow h-3 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

export const pad2 = (i: number) => String(i + 1).padStart(2, "0");

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
