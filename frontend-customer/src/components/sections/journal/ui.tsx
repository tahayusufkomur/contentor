/** Quiet Journal building blocks shared by every journal section. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Txt } from "../kit";
import type { SectionProps } from "../types";

/** Inner measure every journal section aligns to. */
export const WRAP = "mx-auto w-full max-w-[82rem] px-5 md:px-8";

/** Ink pill (primary action). */
export const PILL =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-7 py-3 text-[0.95rem] font-medium text-primary-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground";

/** Paper pill for the moss band. */
export const PILL_ON_MOSS =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--inverse-foreground)] px-7 py-3 text-[0.95rem] font-medium text-[color:var(--inverse)] transition-colors duration-300 hover:bg-background";

/** Serif display sizes. Size comes before leading on purpose: tailwind-merge
 *  drops a leading-* that precedes a text-* size, so any caller overriding the
 *  size must re-state the leading after it. */
export const H1 =
  "font-display font-light text-balance break-words tracking-[-0.022em] text-[clamp(2.75rem,1.35rem+5.3vw,6.75rem)] leading-[1.02]";
export const H2 =
  "font-display font-light text-balance break-words tracking-[-0.018em] text-[clamp(2.25rem,1.55rem+2.5vw,4.1rem)] leading-[1.06]";
export const H3 =
  "font-display font-normal text-balance break-words tracking-[-0.01em]";

/** Tiny functional label (field names, units). */
export const LABEL = "text-[0.7rem] font-medium uppercase tracking-[0.16em]";

type Tone = "paper" | "surface" | "moss";

const TONES: Record<Tone, string> = {
  paper: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  moss: "journal-moss bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
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
        "journal relative w-full py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The kicker: an italic serif dek in rubric red, not a shouty caps label. */
export function Kicker({
  block,
  editable,
  className,
}: Pick<SectionProps, "block" | "editable"> & { className?: string }) {
  return (
    <Txt
      block={block}
      field="kicker"
      editable={editable}
      as="p"
      placeholder="Kicker"
      className={cn(
        "journal-kicker font-display text-[1.125rem] italic leading-snug text-accent md:text-[1.2rem]",
        className,
      )}
    />
  );
}

/** Thin arrow used on "go somewhere" links. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className={cn("journal-arrow h-3 w-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <path d="M0 6h22M17 1l5 5-5 5" />
    </svg>
  );
}

/** Text of a block field as a plain string (for alt text). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
