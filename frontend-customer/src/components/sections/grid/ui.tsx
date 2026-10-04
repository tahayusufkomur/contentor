/**
 * Swiss Grid building blocks. Every section is a full-bleed band whose
 * content sits on one 12-column grid; column 4 is the page's axis — headings,
 * paragraphs and the hero's first-line indent all start there.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { SmartLink, Txt, has } from "../kit";

type Tone = "paper" | "fog" | "ink" | "cobalt";

const TONES: Record<Tone, string> = {
  paper: "bg-background text-foreground",
  fog: "bg-muted text-foreground",
  ink: "bg-foreground text-background",
  cobalt: "swiss-inverse bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
};

/** 12-col grid row with the style's gutters. */
export const row = "grid grid-cols-12 gap-x-4 md:gap-x-6";

export const pad = (n: number) => String(n).padStart(2, "0");

export function Sheet({
  tone = "paper",
  guides,
  className,
  children,
}: {
  tone?: Tone;
  guides?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "swiss-sec relative overflow-hidden px-5 pb-20 pt-14 md:px-8 md:pb-28 md:pt-20",
        TONES[tone],
        className,
      )}
    >
      {guides && <Guides />}
      <div className="relative mx-auto max-w-[88rem]">
        <div className="swiss-rule" />
        {children}
      </div>
    </section>
  );
}

/** The layout grid made visible: hairline column edges (4 on phones, 12 up). */
export function Guides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 px-5 md:px-8">
      <div className="mx-auto grid h-full max-w-[88rem] grid-cols-4 gap-x-4 md:grid-cols-12 md:gap-x-6">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            style={{ "--i": i } as CSSProperties}
            // Never toggle `display` here: that restarts the draw-in animation.
            className={cn("swiss-guide", i >= 4 && "max-md:invisible max-md:absolute")}
          />
        ))}
      </div>
    </div>
  );
}

/** Mono section label (the kicker) — lives in columns 1–3. */
export function Label({
  block,
  editable,
  field = "kicker",
  className,
}: {
  block: Block;
  editable?: EditableContext;
  field?: string;
  className?: string;
}) {
  return (
    <Txt
      block={block}
      field={field}
      editable={editable}
      as="p"
      placeholder="Label"
      className={cn("swiss-mono col-span-12 md:col-span-3", className)}
    />
  );
}

/** Section head: label in cols 1–3, heading + intro from the col-4 axis,
 *  optional aside (e.g. a "see all" link) on the right. */
export function Head({
  block,
  editable,
  heading = "heading",
  intro = "intro",
  aside,
}: {
  block: Block;
  editable?: EditableContext;
  heading?: string;
  intro?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn(row, "gap-y-6 pt-3")}>
      <Label block={block} editable={editable} />
      <div className={cn("col-span-12 md:col-start-4", aside ? "md:col-span-6" : "md:col-span-9")}>
        <Txt
          block={block}
          field={heading}
          editable={editable}
          as="h2"
          placeholder="Heading"
          className="swiss-h2 block"
        />
        {has(block, intro, editable) && (
          <Txt
            block={block}
            field={intro}
            editable={editable}
            as="p"
            placeholder="Intro"
            className="swiss-lead mt-6 block max-w-[46ch] text-muted-foreground"
          />
        )}
      </div>
      {aside && (
        <div className="col-span-12 md:col-span-3 md:col-start-10 md:self-end md:text-right">
          {aside}
        </div>
      )}
    </div>
  );
}

const BTN =
  "swiss-btn inline-flex min-h-12 items-center justify-center px-6 py-3 text-[0.9375rem] font-medium leading-tight";

export const btn = {
  primary: cn(BTN, "bg-primary text-primary-foreground hover:bg-foreground hover:text-background"),
  outline: cn(BTN, "border border-current hover:bg-foreground hover:text-background hover:border-foreground"),
  /** Bone button on the cobalt band. */
  onCobalt: cn(
    BTN,
    "bg-[color:var(--inverse-foreground)] text-[color:var(--inverse)] hover:bg-foreground hover:text-background",
  ),
};

/** Underlined text link used for secondary actions. */
export const textLink =
  "swiss-link inline-flex items-center gap-2 text-[0.9375rem] font-medium underline decoration-1 underline-offset-[6px] hover:text-primary";

/** A CTA whose label is an editable field; hidden on the public site when the
 *  label is empty. */
export function Cta({
  block,
  editable,
  label = "ctaLabel",
  href = "ctaHref",
  fallbackHref,
  className,
}: {
  block: Block;
  editable?: EditableContext;
  label?: string;
  href?: string;
  fallbackHref?: string;
  className: string;
}) {
  if (!has(block, label, editable)) return null;
  const to = (typeof block[href] === "string" && block[href]) || fallbackHref || null;
  return (
    <SmartLink href={editable ? null : to} className={className}>
      <Txt block={block} field={label} editable={editable} placeholder="Button text" />
    </SmartLink>
  );
}
