/** Studio Floor building blocks shared by every studiofloor section:
 *  the dance studio after dark — stage black, neon edges, stretched italic
 *  Anybody type, mirror panels with light bars, and cue numbers. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every studiofloor section aligns to. */
export const WRAP = "mx-auto w-full max-w-[84rem] px-5 md:px-8 lg:px-10";

/** Stretched bold italic display sizes (Anybody). Size before leading on purpose. */
export const H1 =
  "studiofloor-display font-display font-extrabold italic text-balance break-words tracking-tight text-[clamp(2.3rem,1.1rem+4.6vw,5.4rem)] leading-[0.92]";
export const H2 =
  "studiofloor-display font-display font-extrabold italic text-balance break-words tracking-tight text-[clamp(1.8rem,1.3rem+2.2vw,3.6rem)] leading-[0.95]";
export const H3 =
  "studiofloor-display-sm font-display font-extrabold italic text-balance break-words tracking-tight leading-[0.98]";

/** Tracked cue / act labels: "ACT 01", "CUE 02", "STAGE 03". */
export const LABEL =
  "studiofloor-display text-[0.78rem] font-extrabold uppercase tracking-[0.2em] text-primary";
export const LABEL_ACCENT =
  "studiofloor-display text-[0.78rem] font-extrabold uppercase tracking-[0.2em] text-accent";

/** Tabular figures for timing and prices. */
export const NUM = "studiofloor-tnum";

/** Primary neon button: hot magenta with neon glow. */
export const BTN =
  "studiofloor-focus studiofloor-glow-btn inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-7 py-3 studiofloor-display text-[0.98rem] font-extrabold italic text-primary-foreground shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_40%,transparent)] hover:shadow-[0_0_36px_color-mix(in_oklch,var(--primary)_60%,transparent)] transition-all duration-300";

/** Secondary neon button: cyan / accent outline with neon glow. */
export const BTN_GHOST =
  "studiofloor-focus studiofloor-glow-btn inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 border-accent px-7 py-3 studiofloor-display text-[0.98rem] font-extrabold italic text-accent shadow-[0_0_16px_color-mix(in_oklch,var(--accent)_22%,transparent)] hover:bg-accent hover:text-accent-foreground hover:shadow-[0_0_28px_color-mix(in_oklch,var(--accent)_45%,transparent)] transition-all duration-300";

/** High-contrast button on the inverse spotlight band. */
export const BTN_ON_INVERSE =
  "studiofloor-focus studiofloor-glow-btn inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-8 py-3.5 studiofloor-display text-[1rem] font-extrabold italic text-[color:var(--inverse)] shadow-[0_4px_24px_color-mix(in_oklch,var(--inverse-foreground)_30%,transparent)] hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_60%,transparent)] transition-all duration-300";

/** Chip / badge for format, level, schedule. */
export const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-[color-mix(in_oklch,var(--surface)_80%,transparent)] px-3.5 py-1 text-[0.8rem] font-semibold tracking-wide text-foreground";

type Tone = "stage" | "surface" | "spotlight";

const TONES: Record<Tone, string> = {
  stage: "bg-background text-foreground",
  surface:
    "bg-[color-mix(in_oklch,var(--surface)_70%,var(--background))] text-foreground",
  spotlight:
    "studiofloor-spotlight-band bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "stage",
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
        "studiofloor relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker as a small tracked neon cue label. */
export function Kicker({
  block,
  editable,
  cue,
  className,
}: {
  block: Block;
  editable?: EditableContext;
  cue?: string;
  className?: string;
}) {
  if (!has(block, "kicker", editable)) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {cue && (
        <span aria-hidden="true" className={LABEL_ACCENT}>
          {cue} //
        </span>
      )}
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="p"
        placeholder="Kicker"
        className={LABEL}
      />
    </div>
  );
}

/** Standard section opener: kicker + heading left, intro right. */
export function Opener({
  block,
  editable,
  cue,
  field = "intro",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  cue?: string;
  field?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-y-6 lg:grid-cols-12 lg:gap-x-10", className)}>
      <div className="lg:col-span-7">
        <Kicker block={block} editable={editable} cue={cue} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(H2, "mt-3 block max-w-[22ch]")}
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

/** Angled neon stage arrow. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 14"
      className={cn("studiofloor-arrow h-3.5 w-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 7h18M14 1l6 6-6 6" />
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
