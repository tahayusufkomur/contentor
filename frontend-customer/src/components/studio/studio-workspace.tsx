"use client";

// The photo studio's editor from 1024 px: a top bar, a rail of tools with its drawer, and the canvas with the
// toolbar of the selected layer above it and her other covers under it. (Under 1024 px the simple controls are
// the editor: see studio-editor.tsx.)

import { dyn } from "@/i18n/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { CoversStrip } from "@/components/studio/covers-strip";
import { DraftActions } from "@/components/studio/draft-actions";
import { BrandDrawer } from "@/components/studio/drawers/brand";
import { ElementsDrawer } from "@/components/studio/drawers/elements";
import { LayoutsDrawer } from "@/components/studio/drawers/layouts";
import { PhotoEditDrawer } from "@/components/studio/drawers/photo-edit";
import { PhotosDrawer } from "@/components/studio/drawers/photos";
import { TextDrawer } from "@/components/studio/drawers/text";
import { UploadsDrawer } from "@/components/studio/drawers/uploads";
import { LayerToolbar } from "@/components/studio/layer-toolbar";
import type { PhotoSourcesProps } from "@/components/studio/photo-sources";
import { shapeLabel } from "@/components/studio/size-previews";
import {
  activeTool,
  firstTool,
  openTool,
  StudioRail,
  type ToolState,
} from "@/components/studio/studio-rail";
import { StudioCanvas } from "@/components/studio/studio-canvas";
import type { CoverDraft } from "@/components/studio/use-cover-draft";
import { NavLink } from "@/components/ui/nav-link";
import { coverPalette, parseLook } from "@/lib/covers/palette";
import { suggestWords } from "@/lib/designs-api";
import { framesFor } from "@/lib/covers/recipe";
import type { TargetNoun } from "@/lib/covers/targets";
import { cn } from "@/lib/utils";
import { PARTS, SIZES, SOCIAL_SIZES } from "@/types/design";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  DesignRecord,
  DesignTarget,
  PartId,
} from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";

/** Card, Wide and Banner (where her site shows the cover), then Post, Portrait and Story (the social sizes it
 *  is downloaded in), as one choice: the canvas shows the one that is pressed. */
function SizeSwitcher({
  size,
  onSize,
  cardAspect,
}: {
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  cardAspect: CoverAspect;
}) {
  const t = useTranslations("admin.studio");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SizeGroup
        label={t("bar.size")}
        sizes={SIZES}
        size={size}
        onSize={onSize}
        cardAspect={cardAspect}
      />
      <SizeGroup
        label={t("bar.social")}
        sizes={SOCIAL_SIZES}
        size={size}
        onSize={onSize}
        cardAspect={cardAspect}
      />
    </div>
  );
}

function SizeGroup({
  label,
  sizes,
  size,
  onSize,
  cardAspect,
}: {
  label: string;
  sizes: readonly CoverSize[];
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  cardAspect: CoverAspect;
}) {
  const t = useTranslations("admin.studio");
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border bg-muted p-0.5"
    >
      {sizes.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={size === s}
          onClick={() => onSize(s)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
            size === s
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`size.${s}`)}
          <span className="ml-1.5 font-normal text-muted-foreground">
            {shapeLabel(s, cardAspect)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The editor from 1024 px: the top bar, the rail and its drawer, and the canvas with the toolbar of the
 *  layer on it above and her other covers below. */
export function Workspace({
  draft,
  design,
  cover,
  item,
  title,
  noun,
  size,
  onSize,
  cardAspect,
  selected,
  onSelect,
  set,
  photoSources,
  others,
  timeZone,
  notice,
  onDiscard,
  link,
  photoAi = false,
  cutout = false,
  canExport = false,
  wordsAi = false,
}: {
  draft: CoverDraft;
  design: DesignRecord;
  cover: CoverDesign;
  item: CoverItem;
  title: string;
  noun: TargetNoun;
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  cardAspect: CoverAspect;
  selected: string | null;
  onSelect: (id: string | null) => void;
  set: CoverRecipe | null;
  /** What the Photos drawer is given, but for its tab (the rail sets that). */
  photoSources: Omit<PhotoSourcesProps, "tab" | "onTab">;
  others: DesignTarget[];
  timeZone: string;
  notice: string;
  onDiscard: () => void;
  /** The page of her site the item is on, for a QR code. */
  link?: string;
  /** The image model can change photos; the background remover is there. */
  photoAi?: boolean;
  cutout?: boolean;
  /** A design can be downloaded as an image file. */
  canExport?: boolean;
  /** The Designer can suggest the cover's words. */
  wordsAi?: boolean;
}) {
  const t = useTranslations("admin.studio");
  const ta = useTranslations("admin");
  const { recipe } = draft;
  const [tools, setTools] = useState<ToolState>(firstTool);
  const open = (tool: Parameters<typeof openTool>[1]) =>
    setTools((now) => openTool(now, tool));
  // A photo on its way (being made, uploaded or copied) keeps the Photos drawer open under whatever tool
  // she looks at meanwhile: closing it would stop the request, and a new photo is paid for either way. The
  // same holds for a photo being edited in the Edit photo drawer.
  const photosBusy = draft.isWorking("photos");
  const editsBusy = draft.isWorking("edits");

  const palette = useMemo(() => {
    const { style, paletteId } = parseLook(design.look);
    return coverPalette(style, paletteId);
  }, [design.look]);
  // A layer that is no longer on the canvas (removed, or not in this layout or size) is not selected.
  const present = useMemo(
    () => framesFor(recipe, size, cardAspect),
    [recipe, size, cardAspect],
  );
  const layer = selected && present[selected] ? selected : null;
  const extra = recipe.extras.find((one) => one.id === layer);
  const part =
    layer && (PARTS as readonly string[]).includes(layer)
      ? (layer as PartId)
      : undefined;

  const photoTools = {
    ...photoSources,
    tab: tools.photosTab,
    onTab: (photosTab: ToolState["photosTab"]) =>
      setTools((now) => ({ ...now, photosTab })),
  };
  const lit = activeTool(tools);
  const drawer = tools.drawer;

  return (
    <div className="flex h-full min-h-[30rem] flex-col">
      {/* One row where the three parts fit (about 900 px). With the Team panel beside the page they do not, and
          the buttons take a second row: nothing is cut off, and the page never scrolls sideways. */}
      <header className="flex min-h-[3.25rem] shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background px-4 py-1.5">
        <div className="min-w-[10rem] flex-1 leading-tight">
          <NavLink
            href="/admin/studio"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden="true" />
            {ta("nav.items.studio")}
          </NavLink>
          <h1
            className="truncate text-sm font-semibold"
            title={title || undefined}
          >
            {title || t("editor.untitled")}
          </h1>
        </div>
        <SizeSwitcher size={size} onSize={onSize} cardAspect={cardAspect} />
        <div className="flex flex-1 justify-end">
          <DraftActions
            draft={draft}
            design={design}
            editable
            canCopy={false}
            noun={noun}
            onDiscard={onDiscard}
            inBar
            exportShape={canExport ? cardAspect : undefined}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <StudioRail active={lit} onOpen={open} />

        <section
          aria-label={t(`rail.${lit}`)}
          className="w-64 shrink-0 overflow-y-auto border-r bg-background"
        >
          <fieldset disabled={draft.busy} className="min-w-0 p-3">
            <legend className="sr-only">{t("editor.controls")}</legend>
            {drawer === "layouts" && (
              <LayoutsDrawer
                recipe={recipe}
                set={set}
                edit={draft.edit}
                cover={cover}
                item={item}
                cardAspect={cardAspect}
              />
            )}
            {(drawer === "photos" || photosBusy) && (
              <div hidden={drawer !== "photos"}>
                <PhotosDrawer {...photoTools} />
              </div>
            )}
            {(drawer === "edit" || editsBusy) && (
              <div hidden={drawer !== "edit"}>
                <PhotoEditDrawer
                  recipe={recipe}
                  cover={cover}
                  item={item}
                  size={size}
                  cardAspect={cardAspect}
                  edit={draft.edit}
                  photoAi={photoAi}
                  cutout={cutout}
                  generationsLeft={draft.left}
                  onGenerationStart={draft.countPhoto}
                  onUsedUp={draft.photosUsedUp}
                  onPick={draft.pick}
                  onGenerating={draft.setGenerating}
                  onBusy={(on) => draft.setWork("edits", on)}
                />
              </div>
            )}
            {drawer === "text" && (
              <TextDrawer
                recipe={recipe}
                itemTitle={title}
                targetKind={design.target_kind}
                look={design.look}
                cardAspect={cardAspect}
                edit={draft.edit}
                onSelect={onSelect}
                suggest={
                  wordsAi ? (part) => suggestWords(design.id, part) : undefined
                }
              />
            )}
            {drawer === "elements" && (
              <ElementsDrawer
                recipe={recipe}
                targetKind={design.target_kind}
                cardAspect={cardAspect}
                link={link}
                edit={draft.edit}
                onSelect={onSelect}
              />
            )}
            {drawer === "brand" && (
              <BrandDrawer
                recipe={recipe}
                look={design.look}
                logoUrl={design.logo_url}
                selected={layer}
                edit={draft.edit}
              />
            )}
            {drawer === "uploads" && (
              <UploadsDrawer
                onPick={draft.pick}
                onBusy={(on) => draft.setWork("uploads", on)}
                disabled={draft.busy}
              />
            )}
          </fieldset>
        </section>

        <div className="flex min-w-0 flex-1 flex-col bg-muted/40">
          {/* The tools of a layer take one row from 1440 px and two under it (measured, the widest layer
              at 1024 px). The place is kept whether or not a layer is selected, so the canvas does not
              move under her pointer. */}
          <fieldset
            disabled={draft.busy}
            className="min-h-[6.5rem] min-w-0 px-6 pb-2 pt-4 [@media(min-width:1440px)]:min-h-[4.5rem]"
          >
            {extra || part ? (
              <LayerToolbar
                part={part}
                extra={extra}
                recipe={recipe}
                palette={palette}
                targetKind={design.target_kind}
                onEdit={draft.edit}
                onSelect={onSelect}
                itemTitle={item.title}
                onEditPhoto={() => open("edit")}
              />
            ) : (
              <p className="pt-1 text-xs text-muted-foreground">
                {t("canvas.hint")}
              </p>
            )}
          </fieldset>
          {/* The cover, one line about it, and her other covers, all on the first screen: the canvas takes
              what the rest leaves (a size container, so the canvas can be the biggest box of its shape that
              fits: `100cqh` is its height), but never under 20rem. Below that the column scrolls. The padding
              keeps the handles of a layer at the canvas's edge (they reach 8 px out) from being cut off. */}
          <div
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-2"
            onErrorCapture={draft.refreshPhotos}
          >
            <div className="flex min-h-[20rem] flex-1 items-center [--cover-max-h:100cqh] [container-type:size]">
              <StudioCanvas
                recipe={recipe}
                design={cover}
                item={item}
                size={size}
                cardAspect={cardAspect}
                selected={layer}
                onSelect={onSelect}
                onEdit={draft.edit}
                generating={draft.generating}
                disabled={draft.busy}
              />
            </div>
            <p className="shrink-0 text-center text-xs text-muted-foreground">
              {t("editor.coverLine", {
                cover:
                  noun === "event"
                    ? t("editor.eventCover", {
                        kind: ta(
                          dyn(ta, `events.kinds.${design.target_kind}.label`),
                        ),
                      })
                    : t(`editor.${noun}Cover`),
                notice,
              })}
            </p>
            <CoversStrip
              targets={others}
              cardAspect={cardAspect}
              timeZone={timeZone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
