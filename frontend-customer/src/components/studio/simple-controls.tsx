"use client";

// The whole editor on a phone, and the first version of it on a computer: seven short sections, each a
// list or a field. Every control sends one action to the edit reducer (lib/covers/editor.ts) carrying only
// what it changed, so a burst of typing is one undo step.

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import {
  PhotoSources,
  type PhotoSourcesProps,
} from "@/components/studio/photo-sources";
import { shapeLabel } from "@/components/studio/size-previews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { EditorAction } from "@/lib/covers/editor";
import {
  coverPalette,
  isHex,
  parseLook,
  typeColour,
} from "@/lib/covers/palette";
import { badgeKindsFor, panelPaint } from "@/lib/covers/recipe";
import { targetNoun } from "@/lib/covers/targets";
import { cn } from "@/lib/utils";
import { LAYOUTS, PAINT_ROLES, SIZES, TEXT_MAX } from "@/types/design";
import type {
  BadgeKind,
  CoverRecipe,
  CoverSize,
  LayoutId,
  Paint,
} from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";

/** One of the cover's own words. */
export type WordPart = "label" | "title" | "subtitle";

export interface SimpleControlsProps {
  recipe: CoverRecipe;
  /** "course", "download", or the kind of event series. */
  targetKind: string;
  /** The item's own title: what an empty Title follows. */
  itemTitle: string;
  /** `<style id>` or `<style id>:<palette id>`: where the colour swatches come from. */
  look: string;
  /** Her logo's link; none means there is no logo for the switch to show. */
  logoUrl: string | null;
  /** The cover she kept last, whose layout and colours "Your set" brings; none hides the choice. */
  set: CoverRecipe | null;
  /** The size shown large. */
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  edit: (action: EditorAction) => void;
  photoSources: PhotoSourcesProps;
  /** Asks the Designer for three options for one of the words; none hides the Suggest buttons. */
  suggest?: (part: WordPart) => Promise<string[]>;
}

const FIELD =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A small drawing of where a layout puts the colour, the photo and the words. */
function LayoutGlyph({ layout }: { layout: LayoutId }) {
  const photo = "absolute bg-foreground/20";
  const colour = "absolute bg-foreground/60";
  const words = "absolute rounded-[1px] bg-background";
  return (
    <span
      aria-hidden="true"
      className="relative block aspect-video overflow-hidden rounded-sm border bg-muted"
    >
      {layout === "panel" && (
        <>
          <span className={cn(colour, "inset-y-0 left-0 w-[44%]")} />
          <span
            className={cn(words, "bottom-[30%] left-[7%] h-[12%] w-[28%]")}
          />
          <span
            className={cn(words, "bottom-[14%] left-[7%] h-[7%] w-[20%]")}
          />
        </>
      )}
      {layout === "full" && (
        <>
          <span className={cn(photo, "inset-0")} />
          <span
            className={cn(words, "bottom-[16%] left-[8%] h-[12%] w-[50%]")}
          />
        </>
      )}
      {layout === "title" && (
        <>
          <span className={cn(colour, "inset-0")} />
          <span className={cn(words, "left-[25%] top-[40%] h-[16%] w-[50%]")} />
        </>
      )}
      {layout === "band" && (
        <>
          <span className={cn(photo, "inset-0")} />
          <span className={cn(colour, "inset-x-0 bottom-0 h-[36%]")} />
          <span
            className={cn(words, "bottom-[12%] left-[8%] h-[10%] w-[40%]")}
          />
        </>
      )}
      {layout === "framed" && (
        <>
          <span className={cn(colour, "inset-0")} />
          <span
            className={cn(
              photo,
              "inset-y-[14%] left-[30%] right-[30%] bg-muted",
            )}
          />
        </>
      )}
      {layout === "photo" && <span className={cn(photo, "inset-0")} />}
      {layout === "cutout" && (
        <>
          <span className={cn(colour, "inset-0")} />
          {/* her figure, standing at the foot of the cover */}
          <span
            className={cn(
              photo,
              "bottom-0 right-[14%] h-[78%] w-[30%] rounded-t-full bg-background/70",
            )}
          />
          <span className={cn(words, "left-[8%] top-[22%] h-[14%] w-[40%]")} />
        </>
      )}
    </span>
  );
}

/** "Suggest" under a word: the Designer's three options for it, each one tap from the cover. */
function Suggest({
  part,
  suggest,
  edit,
}: {
  part: WordPart;
  suggest: (part: WordPart) => Promise<string[]>;
  edit: (action: EditorAction) => void;
}) {
  const t = useTranslations("admin.studio.controls");
  const [options, setOptions] = useState<string[]>([]);
  const { run, loading } = useAsyncAction(
    async () => setOptions(await suggest(part)),
    { errorToast: t("suggestFailed") },
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        loading={loading}
        loadingText={t("suggesting")}
        onClick={() => void run()}
      >
        <Sparkles aria-hidden="true" />
        {t(options.length > 0 ? "suggestMore" : "suggest")}
      </Button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            edit({ type: "words", patch: { [part]: option } });
            setOptions([]);
          }}
          className="rounded-full border bg-background px-2.5 py-1 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Words({
  recipe,
  itemTitle,
  targetKind,
  edit,
  suggest,
}: Pick<
  SimpleControlsProps,
  "recipe" | "itemTitle" | "targetKind" | "edit" | "suggest"
>) {
  const t = useTranslations("admin.studio.controls");
  const id = useId();
  const { words } = recipe;
  return (
    <Section title={t("words")}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-label`}>{t("label")}</Label>
        <Input
          id={`${id}-label`}
          value={words.label}
          maxLength={TEXT_MAX.label}
          placeholder={t(`labelPlaceholder.${targetNoun(targetKind)}`)}
          onChange={(e) =>
            edit({ type: "words", patch: { label: e.target.value } })
          }
        />
        {suggest && <Suggest part="label" suggest={suggest} edit={edit} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>{t("title")}</Label>
        <Input
          id={`${id}-title`}
          value={words.title ?? ""}
          maxLength={TEXT_MAX.title}
          placeholder={itemTitle}
          aria-describedby={`${id}-title-hint`}
          onChange={(e) =>
            edit({ type: "words", patch: { title: e.target.value } })
          }
        />
        <p id={`${id}-title-hint`} className="text-xs text-muted-foreground">
          {t("titleHint", {
            target: targetNoun(targetKind),
          })}
        </p>
        {suggest && <Suggest part="title" suggest={suggest} edit={edit} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-subtitle`}>{t("subtitle")}</Label>
        <Input
          id={`${id}-subtitle`}
          value={words.subtitle}
          maxLength={TEXT_MAX.subtitle}
          placeholder={t("subtitlePlaceholder")}
          onChange={(e) =>
            edit({ type: "words", patch: { subtitle: e.target.value } })
          }
        />
        {suggest && <Suggest part="subtitle" suggest={suggest} edit={edit} />}
      </div>
    </Section>
  );
}

export function Layout({
  recipe,
  set,
  edit,
  columns = 3,
}: Pick<SimpleControlsProps, "recipe" | "set" | "edit"> & {
  /** How many layouts sit side by side: three in the controls' column, two in the desktop drawer. */
  columns?: 2 | 3;
}) {
  const t = useTranslations("admin.studio.controls");
  const tile =
    "block w-full space-y-1.5 rounded-lg border p-2 text-left text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring";
  return (
    <Section title={t("layout")}>
      {set && (
        <button
          type="button"
          // beside its words, not above them: it is one choice, not one of the six
          className={cn(tile, "flex items-center gap-3 space-y-0")}
          onClick={() => edit({ type: "applySet", set })}
        >
          <span className="w-28 shrink-0">
            <LayoutGlyph layout={set.layout} />
          </span>
          <span className="min-w-0">
            <span className="block">{t("set")}</span>
            <span className="block font-normal text-muted-foreground">
              {t("setHint")}
            </span>
          </span>
        </button>
      )}
      <ul
        className={cn(
          "grid gap-2",
          columns === 2 ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {LAYOUTS.map((layout) => (
          <li key={layout}>
            <button
              type="button"
              aria-pressed={recipe.layout === layout}
              className={cn(
                tile,
                recipe.layout === layout && "border-foreground bg-accent",
              )}
              // the layout she is on stays as it is
              onClick={() =>
                recipe.layout !== layout && edit({ type: "layout", layout })
              }
            >
              <LayoutGlyph layout={layout} />
              <span className="block">{t(`layouts.${layout}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** A field for any colour as `#rrggbb`, with a chip of it: what the swatches cannot give. `current` is the colour
 *  the layer has (none while it is deleted); a whole colour typed that is not it goes to `onPick`. */
export function HexColour({
  current,
  onPick,
}: {
  current: Paint | undefined;
  onPick: (hex: `#${string}`) => void;
}) {
  const t = useTranslations("admin.studio.controls");
  const id = useId();
  const own = current && isHex(current) ? current : "";
  // What she is typing, until it is a whole colour; a swatch, undo and a set put the layer's own back.
  const [typed, setTyped] = useState(own);
  useEffect(() => {
    setTyped(own);
  }, [own]);

  const type = (value: string) => {
    const { text, pick } = typeColour(value, current);
    setTyped(text);
    if (pick) onPick(pick);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-hex`}>{t("custom")}</Label>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-8 shrink-0 rounded-md border border-foreground/20"
          style={{ background: isHex(typed) ? typed : "transparent" }}
        />
        <Input
          id={`${id}-hex`}
          value={typed}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder="#1E5AA8"
          className="font-mono"
          onChange={(e) => type(e.target.value.trim())}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("colourHint")}</p>
    </div>
  );
}

function Colour({
  recipe,
  look,
  edit,
}: Pick<SimpleControlsProps, "recipe" | "look" | "edit">) {
  const t = useTranslations("admin.studio.controls");
  const palette = useMemo(() => {
    const { style, paletteId } = parseLook(look);
    return coverPalette(style, paletteId);
  }, [look]);
  // none while she has deleted the panel on the canvas: no swatch is on, and each one shows it again
  const current = panelPaint(recipe);

  return (
    <Section title={t("colour")}>
      <ul className="flex flex-wrap gap-2">
        {PAINT_ROLES.map((role) => (
          <li key={role}>
            <button
              type="button"
              aria-pressed={current === role}
              aria-label={t(`paint.${role}`)}
              title={t(`paint.${role}`)}
              onClick={() =>
                current !== role && edit({ type: "panel", paint: role })
              }
              style={{ background: palette[role] }}
              className={cn(
                "size-8 rounded-full border border-foreground/20 outline-none ring-offset-2 ring-offset-background focus-visible:ring-[3px] focus-visible:ring-ring",
                current === role && "ring-2 ring-foreground",
              )}
            />
          </li>
        ))}
      </ul>
      <HexColour
        current={current}
        onPick={(paint) => edit({ type: "panel", paint })}
      />
    </Section>
  );
}

function Badge({
  recipe,
  targetKind,
  edit,
}: Pick<SimpleControlsProps, "recipe" | "targetKind" | "edit">) {
  const t = useTranslations("admin.studio.controls");
  const id = useId();
  const { badge } = recipe;
  // A course or download has no date to show, and an event is never new: leave out what could never draw.
  const kinds = badgeKindsFor(targetKind, badge.kind);
  // A badge she deleted on the canvas is not drawn, whatever its kind: the select then shows none of them, so
  // that choosing one, the kind it had too, brings it back.
  const deleted = Boolean(recipe.styles.badge?.hidden);
  return (
    <Section title={t("badge")}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-kind`}>{t("badgeShows")}</Label>
        <select
          id={`${id}-kind`}
          className={FIELD}
          value={deleted ? "" : badge.kind}
          onChange={(e) =>
            edit({
              type: "badge",
              patch: { kind: e.target.value as BadgeKind },
            })
          }
        >
          {deleted && (
            <option value="" disabled>
              {t("badgeDeleted")}
            </option>
          )}
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {t(`badges.${kind}`)}
            </option>
          ))}
        </select>
      </div>
      {badge.kind === "text" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-text`}>{t("badgeWords")}</Label>
          <Input
            id={`${id}-text`}
            value={badge.text}
            maxLength={TEXT_MAX.badge}
            placeholder={t("badgeWordsPlaceholder")}
            onChange={(e) =>
              edit({ type: "badge", patch: { text: e.target.value } })
            }
          />
        </div>
      )}
    </Section>
  );
}

export function Logo({
  recipe,
  logoUrl,
  edit,
}: Pick<SimpleControlsProps, "recipe" | "logoUrl" | "edit">) {
  const t = useTranslations("admin.studio.controls");
  const id = useId();
  return (
    <Section title={t("logo")}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{t("showLogo")}</Label>
        <Switch
          id={id}
          checked={recipe.logo && !recipe.styles.logo?.hidden}
          disabled={!logoUrl}
          onCheckedChange={(on) => edit({ type: "logo", on })}
        />
      </div>
      {!logoUrl && (
        <p className="text-xs text-muted-foreground">{t("noLogo")}</p>
      )}
    </Section>
  );
}

function Size({
  look,
  size,
  onSize,
}: Pick<SimpleControlsProps, "look" | "size" | "onSize">) {
  const t = useTranslations("admin.studio");
  const card = parseLook(look).style.coverAspect;
  return (
    <Section title={t("controls.size")}>
      <ul className="grid grid-cols-3 gap-2">
        {SIZES.map((s) => (
          <li key={s}>
            <button
              type="button"
              aria-pressed={size === s}
              onClick={() => onSize(s)}
              className={cn(
                "block w-full rounded-lg border px-2 py-2 text-center text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                size === s && "border-foreground bg-accent",
              )}
            >
              {t(`size.${s}`)}
              <span className="block text-xs font-normal text-muted-foreground">
                {shapeLabel(s, card)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SimpleControls(props: SimpleControlsProps) {
  const t = useTranslations("admin.studio.controls");
  const {
    recipe,
    targetKind,
    itemTitle,
    look,
    logoUrl,
    set,
    size,
    onSize,
    edit,
    suggest,
  } = props;
  return (
    <div className="space-y-6">
      <Words
        recipe={recipe}
        itemTitle={itemTitle}
        targetKind={targetKind}
        edit={edit}
        suggest={suggest}
      />
      <Section title={t("photo")}>
        <PhotoSources {...props.photoSources} />
      </Section>
      <Layout recipe={recipe} set={set} edit={edit} />
      <Colour recipe={recipe} look={look} edit={edit} />
      <Badge recipe={recipe} targetKind={targetKind} edit={edit} />
      <Logo recipe={recipe} logoUrl={logoUrl} edit={edit} />
      <Size look={look} size={size} onSize={onSize} />
    </div>
  );
}
