"use client";

// The toolbar above the canvas: what can be changed about the layer she has selected. Like Part A's
// controls, every control sends one action to the edit reducer carrying only what it changed, so a
// slider drag or a burst of typing is one undo step. Every slider takes its ends from RANGES, the
// ranges the server keeps.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  CaseUpper,
  ChevronDown,
  Copy,
  SendToBack,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  canRemove,
  newExtraId,
  type EditorAction,
  type ExtraPatch,
} from "@/lib/covers/editor";
import { LEADING } from "@/lib/covers/layouts";
import { paintColor, type CoverPalette } from "@/lib/covers/palette";
import { badgeKindsFor, RANGES } from "@/lib/covers/recipe";
import { cn } from "@/lib/utils";
import {
  FONT_ROLES,
  MAX_EXTRAS,
  PAINT_ROLES,
  SHAPES,
  TEXT_MAX,
  WEIGHTS,
} from "@/types/design";
import type {
  CoverRecipe,
  Extra,
  FontRole,
  Paint,
  PartId,
  PartStyle,
  ShapeKind,
  Weight,
} from "@/types/design";

export interface LayerToolbarProps {
  /** The selected layer, when it is one of the fixed parts... */
  part?: PartId;
  /** ...or when it is a layer she added. Exactly one of the two. */
  extra?: Extra;
  recipe: CoverRecipe;
  /** The look's colours, for the swatches. */
  palette: CoverPalette;
  /** "course", or the kind of event: leaves out the badge kinds that could never draw. */
  targetKind?: string;
  onEdit: (action: EditorAction) => void;
  /** Duplicate selects the copy, and Delete lets go of the layer (null). */
  onSelect?: (id: string | null) => void;
}

/** How a kind of text is set when neither the layout nor her style says otherwise.
 *  KEEP IN SYNC with `TYPE` in covers/cover-art.tsx (layer-toolbar.test.ts compares them). */
export const TEXT_DEFAULTS = {
  label: {
    font: "body",
    weight: 600,
    upper: true,
    tracking: 0.12,
    leading: LEADING.label,
  },
  title: {
    font: "display",
    weight: 700,
    upper: false,
    tracking: -0.01,
    leading: LEADING.title,
  },
  subtitle: {
    font: "body",
    weight: 400,
    upper: false,
    tracking: 0,
    leading: LEADING.subtitle,
  },
  extra: {
    font: "body",
    weight: 600,
    upper: false,
    tracking: 0,
    leading: LEADING.subtitle,
  },
} as const;

type TextKind = keyof typeof TEXT_DEFAULTS;

const FIELD =
  "h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50";

function Separator() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />;
}

/** A button with an icon: pressed or not when it is a switch. */
function Tool({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8", pressed && "bg-accent")}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      className={FIELD}
      value={value}
      onChange={(e) =>
        onChange(
          (typeof value === "number"
            ? Number(e.target.value)
            : e.target.value) as T,
        )
      }
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Slider({
  label,
  range,
  step,
  value,
  onChange,
}: {
  label: string;
  range: readonly [number, number];
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-16 cursor-pointer accent-foreground"
      />
    </label>
  );
}

/** A colour from the look's palette, in a menu: `value` is what the layer has now, none where the
 *  layout picks. With `onAuto` the menu offers to go back to that. */
function ColourMenu({
  label,
  value,
  palette,
  onPick,
  onAuto,
}: {
  label: string;
  value: Paint | undefined;
  palette: CoverPalette;
  onPick: (paint: Paint) => void;
  onAuto?: () => void;
}) {
  const t = useTranslations("admin.studio");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(FIELD, "flex items-center gap-1.5")}
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-full border border-foreground/25"
            style={{
              background: value
                ? paintColor(value, palette)
                : "linear-gradient(135deg, #fff 50%, #111 50%)",
            }}
          />
          <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="grid w-52 grid-cols-6 gap-1.5 p-2"
      >
        {onAuto && (
          <DropdownMenuItem
            className="col-span-6 justify-center text-xs"
            onSelect={onAuto}
          >
            {t("toolbar.automatic")}
          </DropdownMenuItem>
        )}
        {PAINT_ROLES.map((role) => (
          <DropdownMenuItem
            key={role}
            aria-label={t(`controls.paint.${role}`)}
            title={t(`controls.paint.${role}`)}
            onSelect={() => onPick(role)}
            className={cn(
              "size-7 justify-center rounded-full border border-foreground/25 p-0",
              value === role && "ring-2 ring-foreground ring-offset-1",
            )}
            style={{ background: palette[role] }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TextTools({
  kind,
  style,
  layout,
  palette,
  setStyle,
}: {
  kind: TextKind;
  style: PartStyle;
  layout: CoverRecipe["layout"];
  palette: CoverPalette;
  setStyle: (patch: Partial<PartStyle>) => void;
}) {
  const t = useTranslations("admin.studio.toolbar");
  const d = TEXT_DEFAULTS[kind];
  // Words align left, except in a title-only cover, where its own are centred.
  const align =
    style.align ?? (kind !== "extra" && layout === "title" ? "center" : "left");
  return (
    <>
      <Select<FontRole>
        label={t("font")}
        value={style.font ?? d.font}
        options={FONT_ROLES.map((role) => ({
          value: role,
          label: t(`fonts.${role}`),
        }))}
        onChange={(font) => setStyle({ font })}
      />
      <Select<Weight>
        label={t("weight")}
        value={style.weight ?? d.weight}
        options={WEIGHTS.map((weight) => ({
          value: weight,
          label: t(`weights.${weight}`),
        }))}
        onChange={(weight) => setStyle({ weight })}
      />
      <Tool
        label={t("upper")}
        pressed={style.upper ?? d.upper}
        onClick={() => setStyle({ upper: !(style.upper ?? d.upper) })}
      >
        <CaseUpper />
      </Tool>
      <span role="group" aria-label={t("align")} className="flex">
        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
          ] as const
        ).map(([side, Icon]) => (
          <Tool
            key={side}
            label={t(`aligns.${side}`)}
            pressed={align === side}
            onClick={() => setStyle({ align: side })}
          >
            <Icon />
          </Tool>
        ))}
      </span>
      <ColourMenu
        label={t("colour")}
        value={style.color}
        palette={palette}
        onPick={(color) => setStyle({ color })}
        onAuto={() => setStyle({ color: undefined })}
      />
      <Separator />
      <Slider
        label={t("size")}
        range={RANGES.scale}
        step={0.05}
        value={style.scale ?? 1}
        onChange={(scale) => setStyle({ scale })}
      />
      <Slider
        label={t("tracking")}
        range={RANGES.tracking}
        step={0.01}
        value={style.tracking ?? d.tracking}
        onChange={(tracking) => setStyle({ tracking })}
      />
      <Slider
        label={t("leading")}
        range={RANGES.leading}
        step={0.05}
        value={style.leading ?? d.leading}
        onChange={(leading) => setStyle({ leading })}
      />
    </>
  );
}

function PhotoTools({
  photo,
  onEdit,
}: {
  photo: CoverRecipe["photo"];
  onEdit: (action: EditorAction) => void;
}) {
  const t = useTranslations("admin.studio.toolbar");
  const adjust = (patch: Partial<CoverRecipe["photo"]>) =>
    onEdit({ type: "photoAdjust", patch });
  return (
    <>
      <Slider
        label={t("focusX")}
        range={RANGES.focus}
        step={0.01}
        value={photo.focus[0]}
        onChange={(x) => adjust({ focus: [x, photo.focus[1]] })}
      />
      <Slider
        label={t("focusY")}
        range={RANGES.focus}
        step={0.01}
        value={photo.focus[1]}
        onChange={(y) => adjust({ focus: [photo.focus[0], y] })}
      />
      <Slider
        label={t("zoom")}
        range={RANGES.zoom}
        step={0.05}
        value={photo.zoom}
        onChange={(zoom) => adjust({ zoom })}
      />
      <Separator />
      <Slider
        label={t("brightness")}
        range={RANGES.brightness}
        step={0.05}
        value={photo.brightness}
        onChange={(brightness) => adjust({ brightness })}
      />
      <Slider
        label={t("contrast")}
        range={RANGES.contrast}
        step={0.05}
        value={photo.contrast}
        onChange={(contrast) => adjust({ contrast })}
      />
      <Slider
        label={t("saturation")}
        range={RANGES.saturation}
        step={0.05}
        value={photo.saturation}
        onChange={(saturation) => adjust({ saturation })}
      />
      <Slider
        label={t("darken")}
        range={RANGES.darken}
        step={0.05}
        value={photo.darken}
        onChange={(darken) => adjust({ darken })}
      />
    </>
  );
}

function BadgeTools({
  extra,
  recipe,
  palette,
  targetKind,
  onEdit,
}: Pick<
  LayerToolbarProps,
  "extra" | "recipe" | "palette" | "targetKind" | "onEdit"
>) {
  const t = useTranslations("admin.studio.toolbar");
  const tc = useTranslations("admin.studio.controls");
  const { badge } = recipe;
  // A badge she added has words of its own; the fixed one shows what its kind says, and has a size
  // (a part's style): a layer she added has no style to hold one.
  const own = extra?.type === "badge" ? extra : null;
  return (
    <>
      {!own && (
        <Select
          label={tc("badgeShows")}
          value={badge.kind}
          options={badgeKindsFor(targetKind, badge.kind).map((kind) => ({
            value: kind,
            label: tc(`badges.${kind}`),
          }))}
          onChange={(kind) => onEdit({ type: "badge", patch: { kind } })}
        />
      )}
      {(own || badge.kind === "text") && (
        <Input
          aria-label={t("badgeWords")}
          title={t("badgeWords")}
          value={own ? own.text : badge.text}
          maxLength={TEXT_MAX.badge}
          placeholder={tc("badgeWordsPlaceholder")}
          className="h-8 w-40 px-2 text-xs"
          onChange={(e) =>
            onEdit(
              own
                ? {
                    type: "updateExtra",
                    id: own.id,
                    patch: { text: e.target.value },
                  }
                : { type: "badge", patch: { text: e.target.value } },
            )
          }
        />
      )}
      <ColourMenu
        label={t("fill")}
        value={own ? own.fill : badge.fill}
        palette={palette}
        onPick={(fill) =>
          onEdit(
            own
              ? { type: "updateExtra", id: own.id, patch: { fill } }
              : { type: "badge", patch: { fill } },
          )
        }
      />
      {!own && (
        <Slider
          label={t("size")}
          range={RANGES.scale}
          step={0.05}
          value={recipe.styles.badge?.scale ?? 1}
          onChange={(scale) =>
            onEdit({ type: "style", part: "badge", patch: { scale } })
          }
        />
      )}
    </>
  );
}

function ShapeTools({
  extra,
  palette,
  onEdit,
}: {
  extra: Extract<Extra, { type: "shape" }>;
  palette: CoverPalette;
  onEdit: (action: EditorAction) => void;
}) {
  const t = useTranslations("admin.studio.toolbar");
  const update = (patch: ExtraPatch) =>
    onEdit({ type: "updateExtra", id: extra.id, patch });
  return (
    <>
      <Select<ShapeKind>
        label={t("shape")}
        value={extra.shape}
        options={SHAPES.map((shape) => ({
          value: shape,
          label: t(`shapes.${shape}`),
        }))}
        onChange={(shape) => update({ shape })}
      />
      <ColourMenu
        label={t("fill")}
        value={extra.fill}
        palette={palette}
        onPick={(fill) => update({ fill })}
      />
      <Slider
        label={t("opacity")}
        range={RANGES.opacity}
        step={0.05}
        value={extra.opacity}
        onChange={(opacity) => update({ opacity })}
      />
    </>
  );
}

/** The logo is white, black, or as it is; none is whichever reads on what it sits on (CoverArt). */
const LOGO_COLOURS = ["auto", "white", "black", "original"] as const;

function LogoTools({
  color,
  onPick,
}: {
  color: Paint | undefined;
  onPick: (color: Paint | undefined) => void;
}) {
  const t = useTranslations("admin.studio.toolbar");
  const current =
    color === undefined
      ? "auto"
      : color === "white" || color === "black"
        ? color
        : "original";
  return (
    <span role="group" aria-label={t("logoColour")} className="flex gap-1">
      {LOGO_COLOURS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={current === option}
          onClick={() =>
            onPick(
              option === "auto"
                ? undefined
                : option === "original"
                  ? "primary"
                  : option,
            )
          }
          className={cn(
            FIELD,
            "px-2.5 font-medium",
            current === option && "border-foreground bg-accent",
          )}
        >
          {t(`logoColours.${option}`)}
        </button>
      ))}
    </span>
  );
}

export function LayerToolbar({
  part,
  extra,
  recipe,
  palette,
  targetKind,
  onEdit,
  onSelect,
}: LayerToolbarProps) {
  const t = useTranslations("admin.studio.toolbar");
  const id = extra?.id ?? part;
  if (!id) return null;

  const name = extra ? extra.type : (part as PartId);
  const setStyle = (patch: Partial<PartStyle>) =>
    extra
      ? onEdit({ type: "updateExtra", id: extra.id, patch: { style: patch } })
      : onEdit({ type: "style", part: part as PartId, patch });
  const textKind: TextKind | null =
    extra?.type === "text"
      ? "extra"
      : part === "label" || part === "title" || part === "subtitle"
        ? part
        : null;
  const at = extra ? recipe.extras.findIndex((e) => e.id === extra.id) : -1;

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border bg-background px-2 py-1 shadow-sm"
    >
      <span className="px-1 text-xs font-semibold">{t(`layer.${name}`)}</span>
      <Separator />
      {textKind && (
        <TextTools
          kind={textKind}
          style={
            extra?.type === "text"
              ? extra.style
              : (recipe.styles[part as PartId] ?? {})
          }
          layout={recipe.layout}
          palette={palette}
          setStyle={setStyle}
        />
      )}
      {part === "photo" && <PhotoTools photo={recipe.photo} onEdit={onEdit} />}
      {(part === "badge" || extra?.type === "badge") && (
        <BadgeTools
          extra={extra}
          recipe={recipe}
          palette={palette}
          targetKind={targetKind}
          onEdit={onEdit}
        />
      )}
      {extra?.type === "shape" && (
        <ShapeTools extra={extra} palette={palette} onEdit={onEdit} />
      )}
      {part === "panel" && (
        <ColourMenu
          label={t("colour")}
          value={recipe.panel}
          palette={palette}
          onPick={(paint) => onEdit({ type: "panel", paint })}
        />
      )}
      {part === "logo" && (
        <LogoTools
          color={recipe.styles.logo?.color}
          onPick={(color) =>
            onEdit({ type: "style", part: "logo", patch: { color } })
          }
        />
      )}
      <span className="ml-auto flex items-center">
        {extra && (
          <>
            <Tool
              label={t("back")}
              disabled={at <= 0}
              onClick={() => onEdit({ type: "order", id, dir: "back" })}
            >
              <SendToBack />
            </Tool>
            <Tool
              label={t("forward")}
              disabled={at >= recipe.extras.length - 1}
              onClick={() => onEdit({ type: "order", id, dir: "forward" })}
            >
              <BringToFront />
            </Tool>
            <Tool
              label={t("duplicate")}
              disabled={recipe.extras.length >= MAX_EXTRAS}
              onClick={() => {
                onEdit({ type: "duplicate", id });
                onSelect?.(newExtraId(recipe, id));
              }}
            >
              <Copy />
            </Tool>
          </>
        )}
        {canRemove(id) && (
          <Tool
            label={t("delete")}
            onClick={() => {
              onEdit({ type: "remove", id });
              onSelect?.(null);
            }}
          >
            <Trash2 />
          </Tool>
        )}
      </span>
    </div>
  );
}
