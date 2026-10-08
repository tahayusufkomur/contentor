/** Atelier building blocks shared by every atelier section: the beauty
 *  atelier — blush paper, a light italic serif (Cormorant), Albert Sans
 *  body, arch-cropped photos with offset champagne hairlines, menu-style
 *  dotted leaders, and pill buttons. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every atelier section aligns to (generous and airy). */
export const WRAP = "mx-auto w-full max-w-[80rem] px-5 md:px-8 lg:px-10";

/** Cormorant display sizes (weight 500). Size before leading on purpose. */
export const H1 =
  "font-display font-medium text-balance break-words tracking-[-0.015em] text-[clamp(2.6rem,1.3rem+5vw,6.5rem)] leading-[1.02]";
export const H2 =
  "font-display font-medium text-balance break-words tracking-[-0.01em] text-[clamp(1.9rem,1.35rem+2.2vw,3.6rem)] leading-[1.08]";
export const H3 = "font-display font-medium text-balance break-words";

/** Tracked small caps label: "0.72rem", uppercase, tracked. */
export const LABEL =
  "text-[0.72rem] font-medium uppercase tracking-[0.2em] text-accent";

/** Tabular figures for prices, hours, dates. */
export const NUM = "atelier-tnum";

/** Pill button (primary action). */
export const BTN =
  "atelier-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-7 py-3 text-[0.92rem] font-medium text-primary-foreground transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-md";

/** Champagne hairline outlined button for second action. */
export const BTN_GHOST =
  "atelier-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-border px-7 py-3 text-[0.92rem] font-medium text-foreground transition-colors duration-300 hover:border-accent hover:text-accent";

/** Pill button on the inverse band. */
export const BTN_ON_INVERSE =
  "atelier-focus inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--inverse-foreground)] px-7 py-3 text-[0.92rem] font-medium text-[color:var(--inverse)] transition-all duration-300 motion-safe:hover:-translate-y-0.5";

/** An arch photo crop. */
export const ARCH = "atelier-arch rounded-t-[999px] overflow-hidden";

type Tone = "blush" | "surface" | "inverse";

const TONES: Record<Tone, string> = {
  blush: "bg-background text-foreground",
  surface: "bg-card text-foreground",
  inverse:
    "atelier-inverse bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "blush",
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
        "atelier relative w-full overflow-x-clip py-20 md:py-28 lg:py-36",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker in italic Cormorant (1.15rem) with champagne accent tint. */
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
      className={cn(
        "font-display text-[1.15rem] italic leading-none text-accent",
        className,
      )}
    />
  );
}

/** Arch photo frame with an offset hairline arch outline behind it. */
export function ArchFrame({
  children,
  className,
  frameClassName,
}: {
  children: ReactNode;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -inset-2.5 rounded-t-[999px] border border-[color-mix(in_oklch,var(--accent)_45%,transparent)] sm:-inset-3.5",
          frameClassName,
        )}
      />
      <div className="relative overflow-hidden rounded-t-[999px]">
        {children}
      </div>
    </div>
  );
}

/** Champagne hairline divider with a tiny diamond ornament in the center. */
export function Divider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "atelier-divider relative my-8 flex items-center justify-center",
        className,
      )}
    >
      <div className="h-px w-full bg-[color-mix(in_oklch,var(--border)_85%,transparent)]" />
      <span className="atelier-divider-diamond absolute size-1.5 rotate-45 border border-accent bg-background" />
    </div>
  );
}

/** A tiny diamond ornament mark. */
export function Diamond({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rotate-45 border border-accent bg-background",
        className,
      )}
    />
  );
}

/** A dotted leader row: label left, dotted leader line, value right. */
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
        className="atelier-dots min-w-[1.5rem] flex-1 translate-y-[-0.25em] self-end"
      />
      <span className={cn(NUM, "shrink-0 font-medium text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}

/** Standard section opener: kicker, heading left, intro right (or centered). */
export function Opener({
  block,
  editable,
  field = "intro",
  align = "left",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string | null;
  align?: "left" | "center";
  className?: string;
}) {
  if (align === "center") {
    return (
      <div
        className={cn(
          "mx-auto flex max-w-3xl flex-col items-center text-center",
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
          className={cn(H2, "mt-3 block max-w-[20ch]")}
        />
        {field && (
          <Txt
            block={block}
            field={field}
            editable={editable}
            as="p"
            placeholder="Intro"
            className="mt-4 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
          />
        )}
      </div>
    );
  }

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
      className={cn("atelier-arrow h-3 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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
