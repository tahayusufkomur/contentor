/** Terminal building blocks shared by every terminal section: the command line
 *  — JetBrains Mono display, prompts with green '$', window chrome panels with
 *  control dots, line-number gutters, code comments '//', and blinking cursors. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { Txt, has } from "../kit";

/** Inner measure every terminal section aligns to. */
export const WRAP = "mx-auto w-full max-w-[78rem] px-5 md:px-8";

/** Monospace display sizes (JetBrains Mono). Size before leading on purpose. */
export const H1 =
  "font-display font-bold text-balance break-words tracking-[-0.03em] text-[clamp(2.5rem,1.3rem+4.5vw,5.5rem)] leading-[1.04]";
export const H2 =
  "font-display font-bold text-balance break-words tracking-[-0.03em] text-[clamp(1.85rem,1.35rem+2vw,3.4rem)] leading-[1.08]";
export const H3 =
  "font-display font-bold text-balance break-words tracking-[-0.02em]";

/** Monospace label: "PARAMS", "INPUT", "CONFIG". */
export const LABEL =
  "font-mono text-[0.78rem] font-bold uppercase tracking-[0.08em] text-accent";

/** Tabular figures for monospace counts and prices. */
export const NUM = "terminal-tnum font-mono";

/** Code comment font style for subtitles and meta lines. */
export const COMMENT = "font-mono text-[0.875rem] text-muted-foreground";

/** Phosphor green button (primary action). */
export const BTN =
  "terminal-focus terminal-btn-hover inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-primary px-6 py-3 font-mono text-[0.95rem] font-bold text-primary-foreground shadow-sm hover:bg-accent hover:text-accent-foreground active:translate-y-0.5";

/** Ghost outlined button for secondary action. */
export const BTN_GHOST =
  "terminal-focus terminal-btn-hover inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] border border-border bg-[color-mix(in_oklch,var(--surface)_60%,transparent)] px-6 py-3 font-mono text-[0.95rem] font-medium text-foreground hover:border-primary hover:text-primary active:translate-y-0.5";

/** High-contrast button on inverse bands. */
export const BTN_ON_INVERSE =
  "terminal-focus terminal-btn-hover inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--inverse-foreground)] px-6 py-3 font-mono text-[0.95rem] font-bold text-[color:var(--inverse)] hover:bg-accent hover:text-accent-foreground active:translate-y-0.5";

type Tone = "console" | "surface" | "inverse";

const TONES: Record<Tone, string> = {
  console: "bg-background text-foreground",
  surface: "bg-surface text-foreground",
  inverse:
    "terminal-inverse bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

export function Section({
  tone = "console",
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
        "terminal relative w-full overflow-x-clip py-20 md:py-28 lg:py-32",
        TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Reusable terminal window frame with 3 dots and a title bar. */
export function WindowChrome({
  title = "~/terminal",
  tag,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  tag?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("terminal-window", className)}>
      <div className="terminal-window-header">
        <div className="terminal-dots" aria-hidden="true">
          <span className="terminal-dot terminal-dot-red" />
          <span className="terminal-dot terminal-dot-yellow" />
          <span className="terminal-dot terminal-dot-green" />
        </div>
        <span className="truncate px-2 font-mono text-xs text-muted-foreground">
          {title}
        </span>
        <span className="font-mono text-[0.7rem] text-muted-foreground opacity-60">
          {tag || "zsh"}
        </span>
      </div>
      <div className={cn("p-6 md:p-8", bodyClassName)}>{children}</div>
    </div>
  );
}

/** The kicker as a terminal command prompt with '$' in primary. */
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
    <p
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[0.85rem] tracking-wide text-muted-foreground",
        className,
      )}
    >
      <span className="font-bold text-primary select-none" aria-hidden="true">
        $
      </span>
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="span"
        placeholder="kicker"
        className="text-foreground"
      />
    </p>
  );
}

/** Blinking block cursor element (steps animation). */
export function Cursor({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "terminal-cursor ml-1.5 inline-block select-none",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Flag chip: e.g. `--recommended` or `--v1.0`. */
export function Flag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-[color-mix(in_oklch,var(--surface)_80%,transparent)] px-2.5 py-1 font-mono text-[0.78rem] font-semibold text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Standard section opener: kicker + H2 left, intro right (styled with comment prefix). */
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
        <div className="flex flex-col justify-end lg:col-span-4 lg:col-start-9">
          <p
            className="font-mono text-xs text-muted-foreground select-none"
            aria-hidden="true"
          >
            {"// overview"}
          </p>
          <Txt
            block={block}
            field={field}
            editable={editable}
            as="p"
            placeholder="Intro"
            className="mt-1 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
          />
        </div>
      )}
    </div>
  );
}

/** Arrow glyph for links and buttons. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        "size-4 shrink-0 transition-transform motion-safe:group-hover:translate-x-1",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

/** "29.00" + "EUR" → "€29" / "$29". */
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
