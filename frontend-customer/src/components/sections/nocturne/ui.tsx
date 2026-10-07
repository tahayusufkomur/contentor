/** Nocturne building blocks shared by every nocturne section: night blue
 *  with one warm lamp — a soft rounded serif (Fraunces at full SOFT),
 *  Figtree body, pill chips for times, a glow on the one button, arched
 *  photographs, and a cream band where daylight is needed. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every nocturne section aligns to (narrow: a bedside). */
export const WRAP = "mx-auto w-full max-w-[76rem] px-5 md:px-8";

/** Soft serif display sizes. Size before leading on purpose (tailwind-merge
 *  drops a leading-* that precedes a text-* size). */
export const H1 =
  "nocturne-soft font-display font-normal text-balance break-words tracking-[-0.012em] text-[clamp(2.7rem,1.4rem+5vw,6.5rem)] leading-[1.0]";
export const H2 =
  "nocturne-soft font-display font-normal text-balance break-words tracking-[-0.01em] text-[clamp(2rem,1.45rem+2.3vw,3.7rem)] leading-[1.06]";
export const H3 =
  "nocturne-soft font-display font-normal text-balance break-words";

/** Small tracked label in lavender (the kicker's voice). */
export const LABEL =
  "text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-accent";

/** Tabular figures for clock times and prices. */
export const NUM = "nocturne-tnum";

/** The lamp: an amber pill with a glow (primary action). */
export const BTN =
  "nocturne-glow nocturne-focus inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-7 py-3 text-[0.95rem] font-semibold text-primary-foreground transition-transform duration-300 motion-safe:hover:-translate-y-0.5";

/** Quiet pill for a second action: lavender outline. */
export const BTN_GHOST =
  "nocturne-focus inline-flex min-h-12 items-center justify-center rounded-full border border-accent px-7 py-3 text-[0.95rem] font-semibold text-accent transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Ink pill for the cream band. */
export const BTN_ON_CREAM =
  "nocturne-focus inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--inverse-foreground)] px-7 py-3 text-[0.95rem] font-semibold text-[color:var(--inverse)] transition-transform duration-300 motion-safe:hover:-translate-y-0.5";

/** A chip: time, format, level. */
export const CHIP =
  "inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-1.5 text-[0.85rem] text-muted-foreground";

type Tone = "night" | "surface" | "cream";

const TONES: Record<Tone, string> = {
  night: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  cream:
    "nocturne-cream bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
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
        "nocturne relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker: a small tracked lavender line. */
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

/** A photograph with an arched top, like a lamp-lit window. */
export const ARCH = "nocturne-arch overflow-hidden";

/** The halo: a warm radial glow behind whatever it wraps. */
export function Halo({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("nocturne-halo relative", className)}>{children}</div>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("nocturne-arrow h-3 w-5 shrink-0", className)}
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

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
