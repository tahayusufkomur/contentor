/**
 * The StyleKit contract: the slots every site style fills so AI-built
 * sections (components/cx) render natively in any style. Styles keep their
 * own constants for their hand-built sections; a kit only names them.
 * Unset slots get neutral, token-only defaults.
 */
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import { Txt, has } from "./kit";

export type KitTone = "base" | "surface" | "inverse";
export type OrnamentSlot = "divider" | "glyph";
export type MediaTreatment = "frame" | "arch" | "circle" | "polaroid";

type BlockPart = ComponentType<{
  block: Block;
  editable?: EditableContext;
  className?: string;
}>;
type Ornament = ComponentType<{ className?: string }>;

export interface StyleKit {
  id: string;
  /** Inner measure (max width + side padding) content aligns to. */
  wrap: string;
  display: string;
  h2: string;
  h3: string;
  /** The style's caption voice (kickers, labels). */
  label: string;
  /** Tabular figures. */
  num: string;
  button: { primary: string; ghost: string; onInverse: string };
  card: string;
  media: Record<MediaTreatment, string>;
  Section: ComponentType<{
    tone: KitTone;
    label?: string;
    children: ReactNode;
  }>;
  Kicker: BlockPart;
  Opener: BlockPart;
  ornaments: Partial<Record<OrnamentSlot, Ornament>>;
}

export interface KitDefinition<T extends string> {
  id: string;
  wrap: string;
  h2: string;
  h3: string;
  display?: string;
  label?: string;
  num?: string;
  button: { primary: string; ghost?: string; onInverse?: string };
  card?: string;
  media?: Partial<Record<MediaTreatment, string>>;
  /** Kit tone → the style's own Section tone. */
  tones: Record<KitTone, T>;
  Section: ComponentType<{
    tone?: T;
    label?: string;
    className?: string;
    children: ReactNode;
  }>;
  Kicker?: BlockPart;
  Opener?: BlockPart;
  ornaments?: Partial<Record<OrnamentSlot, Ornament>>;
}

const DEFAULT_LABEL = "text-[0.72rem] font-medium uppercase tracking-[0.16em]";
const DEFAULT_GHOST =
  "inline-flex min-h-11 items-center gap-2 underline decoration-1 underline-offset-[6px] transition-colors hover:text-primary";
const DEFAULT_CARD =
  "rounded-[var(--radius)] border border-border bg-card p-6 text-card-foreground md:p-8";
const DEFAULT_MEDIA: Record<MediaTreatment, string> = {
  frame: "border border-border p-2 sm:p-3",
  arch: "rounded-t-[999px]",
  circle: "rounded-full",
  polaroid: "-rotate-1 bg-card p-3 pb-12 shadow-lg",
};

function makeKicker(label: string): BlockPart {
  return function KitKicker({ block, editable, className }) {
    if (!has(block, "kicker", editable)) return null;
    return (
      <Txt
        block={block}
        field="kicker"
        editable={editable}
        as="p"
        placeholder="Kicker"
        className={cn(label, "text-muted-foreground", className)}
      />
    );
  };
}

function makeOpener(Kicker: BlockPart, h2: string): BlockPart {
  return function KitOpener({ block, editable, className }) {
    return (
      <div className={cn("flex flex-col", className)}>
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(h2, "mt-4 block max-w-[22ch]")}
        />
        {has(block, "intro", editable) && (
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            placeholder="Intro"
            className="mt-6 block max-w-[52ch] text-pretty text-lg/relaxed text-muted-foreground"
          />
        )}
      </div>
    );
  };
}

/** Build a style's kit from its own constants. */
export function defineKit<T extends string>(def: KitDefinition<T>): StyleKit {
  const { Section: StyleSection, tones } = def;
  const label = def.label ?? DEFAULT_LABEL;
  const Kicker = def.Kicker ?? makeKicker(label);
  function KitSection({
    tone,
    label: aria,
    children,
  }: {
    tone: KitTone;
    label?: string;
    children: ReactNode;
  }) {
    return (
      <StyleSection tone={tones[tone]} label={aria}>
        {children}
      </StyleSection>
    );
  }
  return {
    id: def.id,
    wrap: def.wrap,
    display: def.display ?? def.h2,
    h2: def.h2,
    h3: def.h3,
    label,
    num: def.num ?? "tabular-nums",
    button: {
      primary: def.button.primary,
      ghost: def.button.ghost ?? DEFAULT_GHOST,
      onInverse: def.button.onInverse ?? def.button.primary,
    },
    card: def.card ?? DEFAULT_CARD,
    media: { ...DEFAULT_MEDIA, ...def.media },
    Section: KitSection,
    Kicker,
    Opener: def.Opener ?? makeOpener(Kicker, def.h2),
    ornaments: def.ornaments ?? {},
  };
}

const DEFAULT_TONES: Record<KitTone, string> = {
  base: "bg-background text-foreground",
  surface: "bg-muted text-foreground",
  inverse:
    "bg-[var(--inverse,var(--foreground))] text-[color:var(--inverse-foreground,var(--background))]",
};

function DefaultSection({
  tone = "base",
  label,
  className,
  children,
}: {
  tone?: KitTone;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label || undefined}
      className={cn(
        "relative w-full py-20 md:py-28",
        DEFAULT_TONES[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Neutral kit for tenants without a site style, or with an unknown one. */
export const DEFAULT_KIT = defineKit({
  id: "default",
  wrap: "mx-auto w-full max-w-6xl px-5 md:px-8",
  display:
    "font-display text-balance text-[clamp(2.5rem,1.5rem+4vw,4.75rem)]/[1.02] tracking-tight",
  h2: "font-display text-balance text-[clamp(2rem,1.4rem+2.4vw,3.5rem)]/[1.05] tracking-tight",
  h3: "font-display text-balance text-xl/snug",
  button: {
    primary:
      "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
  },
  tones: { base: "base", surface: "surface", inverse: "inverse" },
  Section: DefaultSection,
});
