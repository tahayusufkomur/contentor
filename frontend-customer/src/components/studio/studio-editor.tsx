"use client";

// The photo studio's editor for one design: a draft is edited, saves itself, and becomes its course's or
// event's cover only when she keeps it (nothing on the site changes before that). A kept or retired design
// opens read-only, and "Edit a copy" starts a draft from it.
//
// Two views over one draft (use-cover-draft.ts): from 1024 px a workspace (a top bar, a rail of tools with
// its drawer, and the canvas with her other covers under it); under it, the simple controls beside the
// previews, which are the whole editor there (spec E18).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { CoversStrip } from "@/components/studio/covers-strip";
import { DiscardDialog } from "@/components/studio/discard-dialog";
import { BrandDrawer } from "@/components/studio/drawers/brand";
import { ElementsDrawer } from "@/components/studio/drawers/elements";
import { LayoutsDrawer } from "@/components/studio/drawers/layouts";
import { PhotosDrawer } from "@/components/studio/drawers/photos";
import { TextDrawer } from "@/components/studio/drawers/text";
import { UploadsDrawer } from "@/components/studio/drawers/uploads";
import { LayerToolbar } from "@/components/studio/layer-toolbar";
import { SaveStatus } from "@/components/studio/save-status";
import { SimpleControls } from "@/components/studio/simple-controls";
import { SizePreviews, shapeLabel } from "@/components/studio/size-previews";
import {
  activeTool,
  firstTool,
  openTool,
  StudioRail,
  type ToolState,
} from "@/components/studio/studio-rail";
import { StudioCanvas } from "@/components/studio/studio-canvas";
import {
  useCoverDraft,
  type CoverDraft,
} from "@/components/studio/use-cover-draft";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";
import { useTenant } from "@/hooks/use-tenant";
import { coverPalette, parseLook } from "@/lib/covers/palette";
import { framesFor, sizeAspect } from "@/lib/covers/recipe";
import { targetItem } from "@/lib/covers/targets";
import { getDesign, getTargets, listDesigns } from "@/lib/designs-api";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import { PARTS, SIZES } from "@/types/design";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  DesignRecord,
  DesignTarget,
  DesignTargets,
  PartId,
} from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";

/** The width from which the workspace is the editor (Tailwind's `lg`); under it the simple controls are. */
const DESKTOP = "(min-width: 1024px)";
const watchDesktop = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
function useDesktop(): boolean {
  return useSyncExternalStore(
    watchDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** What the editor shows while the design and her covers load: the shape of the page. */
export function EditorSkeleton() {
  return (
    <>
      <div className="space-y-6 lg:hidden">
        <SkeletonPageHeader />
        <Skeleton className="aspect-video w-full" />
        <SkeletonForm fields={5} />
      </div>
      {/* From 1024 px the workspace, which has no padding of the page around it. */}
      <div className="hidden h-full min-h-[30rem] flex-col lg:flex">
        <div className="flex h-[3.25rem] shrink-0 items-center gap-4 border-b px-4">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mx-auto h-8 w-56" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-[4.5rem] shrink-0 space-y-2 border-r bg-muted p-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <div className="w-64 shrink-0 space-y-3 border-r p-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-4 bg-muted/40 p-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="mx-auto aspect-video w-full max-w-3xl" />
          </div>
        </div>
      </div>
    </>
  );
}

interface Loaded {
  design: DesignRecord;
  targets: DesignTargets;
  /** Her kept designs, for "Your set". */
  kept: DesignRecord[];
  /** Different for every load, so the editor starts afresh on a reload. */
  stamp: number;
}

/** What can be done to this design: how much it saves, undoes, discards and keeps. On the phone it sits
 *  in the header; in the workspace, in the top bar. */
function DraftActions({
  draft,
  design,
  editable,
  canCopy,
  isCourse,
  onDiscard,
  inBar = false,
}: {
  draft: CoverDraft;
  design: DesignRecord;
  editable: boolean;
  /** A kept or retired design whose course or event is still there can be copied. */
  canCopy: boolean;
  isCourse: boolean;
  onDiscard: () => void;
  /** In the workspace's top bar: one row, buttons no wider than their words. */
  inBar?: boolean;
}) {
  const t = useTranslations("admin.studio");
  const grow = inBar ? undefined : "flex-1 sm:flex-none";
  return (
    // On a phone the saving state and Undo sit above the buttons, which share the row below.
    <div
      className={
        inBar
          ? "flex items-center gap-2"
          : "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
      }
    >
      {editable && (
        <div className="flex items-center gap-1">
          <SaveStatus state={draft.saveState} onRetry={draft.retrySave} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("editor.undo")}
            disabled={!draft.canUndo || draft.busy}
            onClick={draft.undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("editor.redo")}
            disabled={!draft.canRedo || draft.busy}
            onClick={draft.redo}
          >
            <Redo2 />
          </Button>
        </div>
      )}
      <div className={inBar ? "flex gap-2" : "flex w-full gap-2 sm:w-auto"}>
        {design.state === "draft" && (
          <Button
            variant="outline"
            className={grow}
            disabled={draft.locked}
            onClick={onDiscard}
          >
            {t("editor.discard")}
          </Button>
        )}
        {editable && (
          <Button
            className={grow}
            onClick={() => void draft.keep()}
            loading={draft.keeping}
            disabled={draft.locked}
          >
            {isCourse ? t("editor.keepCourse") : t("editor.keepEvent")}
          </Button>
        )}
        {design.state !== "draft" && canCopy && (
          <Button
            className={grow}
            onClick={() => void draft.editCopy()}
            loading={draft.copying}
            disabled={draft.busy}
          >
            {t("editCopy")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Card, Wide and Banner, as one choice: the canvas shows the one that is pressed. */
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
    <div
      role="group"
      aria-label={t("bar.size")}
      className="inline-flex rounded-lg border bg-muted p-0.5"
    >
      {SIZES.map((s) => (
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
function Workspace({
  draft,
  design,
  cover,
  item,
  title,
  isCourse,
  size,
  onSize,
  cardAspect,
  selected,
  onSelect,
  set,
  targets,
  others,
  timeZone,
  notice,
  onDiscard,
}: {
  draft: CoverDraft;
  design: DesignRecord;
  cover: CoverDesign;
  item: CoverItem;
  title: string;
  isCourse: boolean;
  size: CoverSize;
  onSize: (size: CoverSize) => void;
  cardAspect: CoverAspect;
  selected: string | null;
  onSelect: (id: string | null) => void;
  set: CoverRecipe | null;
  targets: DesignTargets;
  others: DesignTarget[];
  timeZone: string;
  notice: string;
  onDiscard: () => void;
}) {
  const t = useTranslations("admin.studio");
  const ta = useTranslations("admin");
  const { recipe } = draft;
  const [tools, setTools] = useState<ToolState>(firstTool);
  const open = (tool: Parameters<typeof openTool>[1]) =>
    setTools((now) => openTool(now, tool));
  // A photo on its way (being made, uploaded or copied) keeps the Photos drawer open under whatever tool
  // she looks at meanwhile: closing it would stop the request, and a new photo is paid for either way.
  const [photosBusy, setPhotosBusy] = useState(false);
  const { setWork } = draft;
  const photosWork = useCallback(
    (on: boolean) => {
      setPhotosBusy(on);
      setWork("photos", on);
    },
    [setWork],
  );
  const uploadsWork = useCallback(
    (on: boolean) => setWork("uploads", on),
    [setWork],
  );

  const aspect = sizeAspect(size, cardAspect);
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
    cardAspect,
    inUse: targets.in_use,
    generationsLeft: targets.generations_left,
    onPick: draft.pick,
    onGenerating: draft.setGenerating,
    onBusy: photosWork,
    tab: tools.photosTab,
    onTab: (photosTab: ToolState["photosTab"]) =>
      setTools((now) => ({ ...now, photosTab })),
  };
  const lit = activeTool(tools);
  const drawer = tools.drawer;

  return (
    <div className="flex h-full min-h-[30rem] flex-col">
      <header className="flex h-[3.25rem] shrink-0 items-center gap-4 border-b bg-background px-4">
        <div className="min-w-0 flex-1 leading-tight">
          <NavLink
            href="/admin/studio"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden="true" />
            {ta("nav.items.studio")}
          </NavLink>
          <h1 className="truncate text-sm font-semibold">
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
            isCourse={isCourse}
            onDiscard={onDiscard}
            inBar
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
              <LayoutsDrawer recipe={recipe} set={set} edit={draft.edit} />
            )}
            {(drawer === "photos" || photosBusy) && (
              <div hidden={drawer !== "photos"}>
                <PhotosDrawer {...photoTools} />
              </div>
            )}
            {drawer === "text" && (
              <TextDrawer
                recipe={recipe}
                itemTitle={title}
                targetKind={design.target_kind}
                look={design.look}
                aspect={aspect}
                edit={draft.edit}
                onSelect={onSelect}
              />
            )}
            {drawer === "elements" && (
              <ElementsDrawer
                recipe={recipe}
                targetKind={design.target_kind}
                aspect={aspect}
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
                onBusy={uploadsWork}
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
            className="min-h-[6.5rem] min-w-0 px-6 pt-4 [@media(min-width:1440px)]:min-h-[4.5rem]"
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
              />
            ) : (
              <p className="pt-1 text-xs text-muted-foreground">
                {t("canvas.hint")}
              </p>
            )}
          </fieldset>
          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 [--cover-max-h:max(46vh,16rem)]"
            onErrorCapture={draft.refreshPhotos}
          >
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
            <div className="space-y-1 text-center text-xs text-muted-foreground">
              <p>
                {isCourse
                  ? t("editor.courseCover")
                  : t("editor.eventCover", {
                      kind: ta(`events.kinds.${design.target_kind}.label`),
                    })}
              </p>
              <p>{notice}</p>
            </div>
            <CoversStrip
              targets={others}
              size={size}
              cardAspect={cardAspect}
              timeZone={timeZone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorBody({
  design,
  targets,
  kept,
  reload,
}: Omit<Loaded, "stamp"> & { reload: () => void }) {
  const t = useTranslations("admin.studio");
  const ta = useTranslations("admin");
  const timeZone = useTenant()?.timezone || "UTC";

  const target = targets.targets.find(
    (x) =>
      x.target_kind === design.target_kind &&
      x.target_key === design.target_key,
  );
  const isCourse = design.target_kind === "course";
  const noun = isCourse ? "course" : "event";
  // Only a draft whose course or event is still there can be edited or kept.
  const editable = design.state === "draft" && Boolean(target);
  const title = target?.title ?? design.title ?? "";
  const item = target
    ? targetItem(target, timeZone)
    : { title, createdAt: null, startsAt: null, timeZone };
  const cardAspect = parseLook(design.look).style.coverAspect;

  const [confirming, setConfirming] = useState(false);
  const draft = useCoverDraft({
    design,
    editable,
    paused: confirming,
    reload,
  });
  const { recipe } = draft;
  // From 1024 px the workspace is the editor; under it, the simple controls.
  const desktop = useDesktop();
  const [size, setSize] = useState<CoverSize>("card");
  // The layer selected on the canvas: a part's id or an extra's.
  const [selected, setSelected] = useState<string | null>(null);

  const cover: CoverDesign = {
    id: design.id,
    recipe,
    photos: draft.photos,
    logo_url: design.logo_url,
    look: design.look,
  };
  // stable between keystrokes, so the strip is not drawn again for each of them
  const others = useMemo(
    () => targets.targets.filter((x) => x !== target),
    [targets, target],
  );
  const set = kept.reduce<DesignRecord | null>(
    (best, one) =>
      !best || (one.kept_at ?? "") > (best.kept_at ?? "") ? one : best,
    null,
  )?.recipe;
  const notice = !target
    ? t("editor.gone")
    : design.state === "kept"
      ? t("editor.isKept", { title })
      : design.state === "retired"
        ? t("editor.replaced")
        : t("editor.waiting", { target: noun });
  const { setWork } = draft;
  const photosWork = useCallback(
    (on: boolean) => setWork("photos", on),
    [setWork],
  );

  return (
    <>
      {desktop && editable ? (
        <Workspace
          draft={draft}
          design={design}
          cover={cover}
          item={item}
          title={title}
          isCourse={isCourse}
          size={size}
          onSize={setSize}
          cardAspect={cardAspect}
          selected={selected}
          onSelect={setSelected}
          set={set ?? null}
          targets={targets}
          others={others}
          timeZone={timeZone}
          notice={notice}
          onDiscard={() => setConfirming(true)}
        />
      ) : (
        // (From 1024 px the page has no padding of its own in the editor: see admin-shell.tsx.)
        <div className="space-y-4 md:space-y-6 lg:p-6">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 space-y-1">
              <NavLink
                href="/admin/studio"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {ta("nav.items.studio")}
              </NavLink>
              <h1 className="truncate text-2xl font-bold tracking-tight">
                {title || t("editor.untitled")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isCourse
                  ? t("editor.courseCover")
                  : t("editor.eventCover", {
                      kind: ta(`events.kinds.${design.target_kind}.label`),
                    })}
              </p>
            </div>
            <DraftActions
              draft={draft}
              design={design}
              editable={editable}
              canCopy={Boolean(target)}
              isCourse={isCourse}
              onDiscard={() => setConfirming(true)}
            />
          </header>
          <p className="text-sm text-muted-foreground">{notice}</p>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
            <div
              className="contents lg:flex lg:flex-col lg:gap-4"
              onErrorCapture={draft.refreshPhotos}
            >
              <SizePreviews
                design={cover}
                item={item}
                size={size}
                onSize={setSize}
                generating={draft.generating}
              />
              <CoversStrip
                targets={others}
                size={size}
                cardAspect={cardAspect}
                timeZone={timeZone}
              />
            </div>
            {editable && (
              <fieldset disabled={draft.busy} className="order-1 min-w-0">
                <legend className="sr-only">{t("editor.controls")}</legend>
                <SimpleControls
                  recipe={recipe}
                  targetKind={design.target_kind}
                  itemTitle={title}
                  look={design.look}
                  logoUrl={design.logo_url}
                  set={set ?? null}
                  size={size}
                  onSize={setSize}
                  edit={draft.edit}
                  photoSources={{
                    cardAspect,
                    inUse: targets.in_use,
                    generationsLeft: targets.generations_left,
                    onPick: draft.pick,
                    onGenerating: draft.setGenerating,
                    onBusy: photosWork,
                  }}
                />
              </fieldset>
            )}
          </div>
        </div>
      )}

      {confirming && (
        <DiscardDialog
          title={title}
          discarding={draft.discarding}
          onDiscard={() => void draft.discard()}
          onCancel={() => !draft.discarding && setConfirming(false)}
        />
      )}
    </>
  );
}

/** The editor at `/admin/studio/<id>`: loads the design, her covers and her kept designs, and starts
 *  afresh on each reload (after Keep, and after Undo from the toast). */
export function StudioEditor({ designId }: { designId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const stamp = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      getDesign(designId),
      getTargets(),
      // "Your set" is a nicety: the editor opens without it when her kept designs cannot be listed.
      listDesigns("kept").catch((): DesignRecord[] => []),
    ])
      .then(([design, targets, kept]) => {
        if (!cancelled) {
          setLoaded({ design, targets, kept, stamp: ++stamp.current });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [designId, reloadKey]);

  // A reload keeps the editor on screen until the new design is there; another design shows the skeleton.
  const loading = !error && (!loaded || loaded.design.id !== designId);

  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  return (
    <PageState
      // From 1024 px the workspace is as tall as the page: its wrapper hands that height down.
      className="lg:h-full"
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<EditorSkeleton />}
    >
      {loaded && (
        <EditorBody
          key={loaded.stamp}
          design={loaded.design}
          targets={loaded.targets}
          kept={loaded.kept}
          reload={() => setReloadKey((k) => k + 1)}
        />
      )}
    </PageState>
  );
}

function NotFound() {
  const t = useTranslations("admin.studio.editor");
  const ta = useTranslations("admin");
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-lg font-semibold">{t("notFound")}</h1>
      <Button asChild variant="outline">
        <NavLink href="/admin/studio">{ta("nav.items.studio")}</NavLink>
      </Button>
    </div>
  );
}
