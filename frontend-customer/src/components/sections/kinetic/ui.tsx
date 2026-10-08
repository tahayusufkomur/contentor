/** Kinetic Club building blocks shared by its sections. */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Content column every section aligns to. */
export const WRAP = "mx-auto w-full max-w-[90rem] px-5 md:px-8";

/** Condensed heavy caps — the voice of the style. */
export const DISPLAY =
  "font-display [font-stretch:62.5%] font-[850] uppercase [line-height:0.86] tracking-[-0.005em] text-balance break-words";

/** Expanded small caps for labels, buttons and meta. */
export const LABEL =
  "font-sans [font-stretch:125%] text-[0.72rem] font-extrabold uppercase [line-height:1] tracking-[0.06em]";

/** Section heading size (h2). */
export const H2 = "text-[clamp(2.75rem,1rem+5vw,6.25rem)]";

/** Square-notched primary button (red) — pair with an <Arrow/>. */
export const BTN =
  "kinetic-notch kinetic-focus inline-flex h-14 items-stretch bg-primary text-primary-foreground transition-colors hover:bg-foreground hover:text-background";

type Tone = "paper" | "iron" | "ink";

const TONES: Record<Tone, string> = {
  paper: "kinetic-paper",
  iron: "kinetic-iron",
  ink: "kinetic-ink",
};

/** A plain band on one of the style's three grounds (kinetic.css). Used by
 *  AI-built sections; the hand-built layouts set their own grounds. */
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
      className={cn(TONES[tone], "relative py-20 md:py-32", className)}
    >
      {children}
    </section>
  );
}

/** The kicker as a volt tag. */
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
      className={cn(
        LABEL,
        "inline-block bg-accent px-2.5 py-1.5 text-accent-foreground",
        className,
      )}
    />
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="square"
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
  );
}

/** Button body: label + square arrow cell. */
export function BtnBody({
  children,
  arrowClass = "bg-accent text-accent-foreground",
}: {
  children: ReactNode;
  arrowClass?: string;
}) {
  return (
    <>
      <span
        className={cn(
          LABEL,
          "flex flex-1 items-center px-5 text-[0.8rem] md:px-6",
        )}
      >
        {children}
      </span>
      <span className={cn("grid w-14 shrink-0 place-items-center", arrowClass)}>
        <Arrow />
      </span>
    </>
  );
}

/** Endless horizontal ticker: renders `items` twice and slides by -50%.
 *  Static under reduced motion. */
export function Marquee({
  items,
  className,
  reverse,
  speed,
}: {
  items: ReactNode[];
  className?: string;
  reverse?: boolean;
  speed?: string;
}) {
  return (
    <div className={cn("kinetic-hold overflow-hidden", className)}>
      <div
        className={cn("kinetic-marquee", reverse && "kinetic-marquee-rev")}
        style={
          speed ? ({ "--kinetic-speed": speed } as CSSProperties) : undefined
        }
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex shrink-0"
            aria-hidden={copy === 1 || undefined}
          >
            {items}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "29.00" + "EUR" → "€29" (falls back to "29 EUR"). */
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
