/** Leaf and container atoms of AI-built sections. Each renderer is a plain
 *  function (no hooks), so one tree renders on the server for visitors and in
 *  the client canvas for the coach. Class names are literals only: nothing
 *  from a spec ever reaches className. */
import {
  Award,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  Clock,
  Coffee,
  Compass,
  Dumbbell,
  Feather,
  Flame,
  Flower2,
  Footprints,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Leaf,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Mountain,
  Music,
  Palette,
  Smile,
  Sparkles,
  Star,
  Sun,
  Target,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { CxNode } from "@shared/cx/types";
import {
  Img,
  Rich as RichField,
  SmartLink,
  Txt,
} from "@/components/sections/kit";
import { cn } from "@/lib/utils";
import {
  type CxCtx,
  type CxRender,
  clampNum,
  isItemBind,
  ordinal,
  pick,
  text,
  valueOf,
} from "./context";

type Tag = "h2" | "h3" | "h4" | "p" | "span";

/** A bound text value: inline-editable when bound to a block field, plain
 *  when bound to an item field. Nothing when empty on the public site. */
function TextOf({
  ctx,
  bind,
  as,
  className,
  placeholder,
}: {
  ctx: CxCtx;
  bind: unknown;
  as: Tag;
  className?: string;
  placeholder?: string;
}) {
  if (!isItemBind(bind)) {
    return (
      <Txt
        block={ctx.block}
        field={String(bind)}
        editable={ctx.editable}
        as={as}
        className={className}
        placeholder={placeholder}
      />
    );
  }
  const value = text(valueOf(ctx, bind));
  if (!value) return null;
  const Tag = as;
  return <Tag className={className}>{value}</Tag>;
}

const TONE = { base: "base", surface: "surface", inverse: "inverse" } as const;

export const Section: CxRender = (node, ctx) => (
  <ctx.kit.Section
    tone={pick(node.tone, TONE, "base")}
    label={text(ctx.block.heading) || undefined}
  >
    <div
      className={cn(
        ctx.kit.wrap,
        "flex flex-col gap-12 md:gap-16",
        node.width === "narrow" && "max-w-3xl",
        node.width === "full" && "max-w-none",
      )}
    >
      {ctx.render(node.children, ctx)}
    </div>
  </ctx.kit.Section>
);

export const Sequence: CxRender = (node, ctx) => (
  <>{ctx.render(node.children, ctx)}</>
);

export const Opener: CxRender = (_node, ctx) => (
  <ctx.kit.Opener block={ctx.block} editable={ctx.editable} />
);

export const Heading: CxRender = (node, ctx) => {
  const level: 2 | 3 | 4 = node.level === 2 ? 2 : node.level === 4 ? 4 : 3;
  const large = node.size === "lg";
  const base =
    level === 2
      ? large
        ? ctx.kit.display
        : ctx.kit.h2
      : large
        ? ctx.kit.h2
        : ctx.kit.h3;
  return (
    <TextOf
      ctx={ctx}
      bind={node.bind}
      as={`h${level}`}
      placeholder="Heading"
      className={cn(
        "block",
        base,
        level === 4 && !large && "text-lg/snug",
        node.size === "sm" && "text-[1.35rem]/[1.2]",
      )}
    />
  );
};

const TEXT_SIZE = {
  sm: "text-sm/relaxed",
  md: "text-base/relaxed md:text-[1.0625rem]/[1.7]",
  lg: "text-lg/relaxed md:text-xl/relaxed",
};
const MEASURE = { narrow: "max-w-[44ch]", normal: "max-w-[65ch]", wide: "" };

export const Text: CxRender = (node, ctx) => (
  <TextOf
    ctx={ctx}
    bind={node.bind}
    as="p"
    placeholder="Text"
    className={cn(
      "block text-pretty",
      pick(node.size, TEXT_SIZE, "md"),
      pick(node.measure, MEASURE, "normal"),
      node.muted === true && "text-muted-foreground",
    )}
  />
);

export const Rich: CxRender = (node, ctx) => (
  <RichField
    block={ctx.block}
    field={String(node.bind)}
    editable={ctx.editable}
    className="max-w-[65ch] text-base/relaxed"
  />
);

export const Label: CxRender = (node, ctx) => (
  <TextOf
    ctx={ctx}
    bind={node.bind}
    as="p"
    placeholder="Label"
    className={cn(ctx.kit.label, "block text-muted-foreground")}
  />
);

export const Badge: CxRender = (node, ctx) => (
  <TextOf
    ctx={ctx}
    bind={node.bind}
    as="span"
    placeholder="Badge"
    className={cn(
      ctx.kit.label,
      "inline-flex w-fit items-center rounded-full border border-current px-3 py-1",
    )}
  />
);

const NUM = "block font-display text-[2rem]/none text-accent";

export const Num: CxRender = (node, ctx) =>
  node.bind ? (
    <TextOf
      ctx={ctx}
      bind={node.bind}
      as="span"
      className={cn(ctx.kit.num, NUM)}
    />
  ) : (
    <span aria-hidden="true" className={cn(ctx.kit.num, NUM)}>
      {ordinal(ctx.index ?? 0, node.format)}
    </span>
  );

export const ImgNode: CxRender = (node, ctx) => {
  const value = valueOf(ctx, node.bind);
  const treatment =
    typeof node.treatment === "string" ? node.treatment : "plain";
  const ratio =
    treatment === "circle" ? 1 : clampNum(node.aspect, 0.5, 2.5, 1.333);
  const { media } = ctx.kit;
  const alt =
    text((value as { alt?: unknown } | null | undefined)?.alt) ||
    text(ctx.item?.title) ||
    text(ctx.block.heading);
  return (
    <div
      className={cn(
        "w-full",
        treatment === "frame" && media.frame,
        treatment === "polaroid" && media.polaroid,
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          treatment === "arch" && media.arch,
          treatment === "circle" && media.circle,
        )}
        style={{ aspectRatio: String(ratio) }}
      >
        <Img
          value={value}
          alt={alt}
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
};

function Action({
  node,
  ctx,
  className,
}: {
  node: CxNode;
  ctx: CxCtx;
  className: string;
}) {
  const label = text(valueOf(ctx, node.label));
  const editingLabel = Boolean(ctx.editable) && !isItemBind(node.label);
  if (!label && !editingLabel) return null;
  const href = text(valueOf(ctx, node.href)) || null;
  return (
    <SmartLink
      href={ctx.editable ? null : href}
      className={cn("w-fit", className)}
    >
      <TextOf ctx={ctx} bind={node.label} as="span" placeholder="Button text" />
    </SmartLink>
  );
}

export const Button: CxRender = (node, ctx) => (
  <Action
    node={node}
    ctx={ctx}
    className={
      node.variant === "ghost"
        ? ctx.kit.button.ghost
        : node.variant === "onInverse"
          ? ctx.kit.button.onInverse
          : ctx.kit.button.primary
    }
  />
);

export const LinkNode: CxRender = (node, ctx) => (
  <Action
    node={node}
    ctx={ctx}
    className="underline decoration-1 underline-offset-[6px] transition-colors hover:text-primary"
  />
);

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  heart: Heart,
  star: Star,
  sun: Sun,
  moon: Moon,
  leaf: Leaf,
  flower: Flower2,
  mountain: Mountain,
  waves: Waves,
  flame: Flame,
  music: Music,
  palette: Palette,
  camera: Camera,
  book: BookOpen,
  graduation: GraduationCap,
  dumbbell: Dumbbell,
  footprints: Footprints,
  clock: Clock,
  calendar: CalendarDays,
  pin: MapPin,
  users: Users,
  chat: MessageCircle,
  mail: Mail,
  check: Check,
  gift: Gift,
  coffee: Coffee,
  globe: Globe,
  award: Award,
  target: Target,
  smile: Smile,
  compass: Compass,
  feather: Feather,
};
export const ICON_NAMES = Object.keys(ICONS);
const ICON_SIZE = { sm: "size-5", md: "size-7", lg: "size-10" };

export const Icon: CxRender = (node) => {
  const Glyph =
    typeof node.name === "string" &&
    Object.prototype.hasOwnProperty.call(ICONS, node.name)
      ? ICONS[node.name]
      : null;
  return Glyph ? (
    <Glyph
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn("text-primary", pick(node.size, ICON_SIZE, "md"))}
    />
  ) : null;
};

export const Card: CxRender = (node, ctx) => (
  <div
    className={cn(
      "flex flex-col gap-4",
      ctx.kit.card,
      node.emphasis === "strong" && "bg-muted",
    )}
  >
    {ctx.render(node.children, ctx)}
  </div>
);

const GAP = { sm: "gap-3", md: "gap-6", lg: "gap-10" };

export const Stack: CxRender = (node, ctx) => (
  <div
    className={cn(
      "flex min-w-0 flex-col",
      pick(node.gap, GAP, "md"),
      node.align === "center" && "items-center text-center",
    )}
  >
    {ctx.render(node.children, ctx)}
  </div>
);

export const Ornament: CxRender = (node, ctx) => {
  const slot = node.slot === "glyph" ? "glyph" : "divider";
  const Own = ctx.kit.ornaments[slot];
  if (Own) return <Own />;
  return slot === "divider" ? (
    <span
      aria-hidden="true"
      className="block h-px w-16 bg-current opacity-30"
    />
  ) : (
    <span aria-hidden="true" className="text-xl text-accent">
      ✦
    </span>
  );
};
