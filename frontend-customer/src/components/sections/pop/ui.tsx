import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import { SmartLink, Txt, has } from "../kit";

/** Inner content width shared by every pop section. */
export const WRAP = "relative mx-auto w-full max-w-[84rem] px-5 md:px-8";

/** Tailwind fill classes for the swatches (static strings so they compile). */
export const FILL = {
  lime: "bg-[var(--accent)]",
  pink: "bg-[var(--pop-pink)]",
  lilac: "bg-[var(--card)]",
  sun: "bg-[var(--pop-sun)]",
  paper: "bg-[var(--pop-paper)]",
  berry: "bg-[var(--primary)] text-[color:var(--primary-foreground)]",
  plum: "bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
} as const;

export function PopSection({
  bg,
  fg,
  dark,
  className,
  style,
  children,
}: {
  bg: string;
  /** Text colour for the section (defaults to the ink foreground). */
  fg?: string;
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("pop-root", dark && "pop-dark", className)}
      style={
        {
          "--pop-bg": bg,
          ...(fg ? { "--pop-fg": fg } : {}),
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </section>
  );
}

export function Kicker({
  block,
  editable,
  fill = "lime",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  fill?: keyof typeof FILL;
  className?: string;
}) {
  return (
    <Txt
      block={block}
      field="kicker"
      editable={editable}
      as="p"
      className={cn("pop-kicker", FILL[fill], className)}
      placeholder="Kicker"
    />
  );
}

/** A pill button for a block's label/link field pair. Nothing when the label
 *  is empty on the public site. */
export function PopButton({
  block,
  editable,
  label,
  href,
  fallbackHref,
  tone = "primary",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  label: string;
  href?: string;
  fallbackHref?: string;
  tone?: "primary" | "paper" | "ink";
  className?: string;
}) {
  if (!has(block, label, editable)) return null;
  const link =
    (href && typeof block[href] === "string" && block[href]) ||
    fallbackHref ||
    "";
  return (
    <SmartLink
      href={link}
      className={cn("pop-btn", `pop-btn-${tone}`, className)}
    >
      <Txt
        block={block}
        field={label}
        editable={editable}
        placeholder="Button text"
      />
    </SmartLink>
  );
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Circular rotating badge with text set around the ring (used for the hero
 *  `meta` line). The ring text is repeated to close the circle. */
export function RingBadge({
  text,
  uid,
  className,
}: {
  text: string;
  uid: string;
  className?: string;
}) {
  const unit = `${text.toUpperCase()}  ✦  `;
  const reps = Math.max(1, Math.floor(52 / unit.length));
  const ring = unit.repeat(reps);
  const fontSize = Math.min(17, Math.max(11, 490 / (0.6 * ring.length)));
  const pathId = `pop-ring-${uid.replace(/[^\w-]/g, "")}`;
  return (
    <div className={cn("pop-wiggle aspect-square rounded-full", className)}>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={text}
        className="pop-spin block h-full w-full"
      >
        <defs>
          <path
            id={pathId}
            d="M22,100 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"
          />
        </defs>
        <circle
          cx="100"
          cy="100"
          r="97"
          style={{ fill: "var(--accent)", stroke: "var(--foreground)" }}
          strokeWidth="3"
        />
        <circle
          cx="100"
          cy="100"
          r="64"
          style={{ fill: "none", stroke: "var(--foreground)" }}
          strokeWidth="2"
        />
        <text
          style={{
            fill: "var(--foreground)",
            fontFamily: "'DM Mono', ui-monospace, monospace",
            fontWeight: 500,
            fontSize,
          }}
        >
          <textPath href={`#${pathId}`} textLength="488" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
        <path
          d="M100 70 L106 92 L128 86 L111 100 L128 114 L106 108 L100 130 L94 108 L72 114 L89 100 L72 86 L94 92 Z"
          style={{ fill: "var(--primary)", stroke: "var(--foreground)" }}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
