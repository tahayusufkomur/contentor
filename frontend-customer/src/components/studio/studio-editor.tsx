"use client";

// The photo studio's editor for one design: a draft is edited, saves itself, and becomes its course's or
// event's cover only when she keeps it (nothing on the site changes before that). A kept or retired design
// opens read-only, and "Edit a copy" starts a draft from it.
//
// Two views over one draft (use-cover-draft.ts): from 1024 px a workspace (a top bar, a rail of tools with
// its drawer, and the canvas with her other covers under it); under it, the simple controls beside the
// previews, which are the whole editor there (spec E18).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { CoversStrip } from "@/components/studio/covers-strip";
import { DiscardDialog } from "@/components/studio/discard-dialog";
import { DraftActions } from "@/components/studio/draft-actions";
import { SimpleControls } from "@/components/studio/simple-controls";
import { SizePreviews } from "@/components/studio/size-previews";
import { useCoverDraft } from "@/components/studio/use-cover-draft";
import { Workspace } from "@/components/studio/studio-workspace";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";
import { useTenant } from "@/hooks/use-tenant";
import { parseLook } from "@/lib/covers/palette";
import { targetItem, targetNoun } from "@/lib/covers/targets";
import { getDesign, getTargets, listDesigns } from "@/lib/designs-api";
import { ApiError } from "@/types/api";
import type {
  CoverDesign,
  CoverSize,
  DesignRecord,
  DesignTargets,
} from "@/types/design";

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
          <div className="flex min-w-0 flex-1 flex-col gap-3 bg-muted/40 p-6">
            <Skeleton className="h-12 w-full shrink-0" />
            <Skeleton className="mx-auto min-h-[20rem] w-full max-w-3xl flex-1" />
            <Skeleton className="h-36 w-full shrink-0" />
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
  const noun = targetNoun(design.target_kind);
  // Only a draft whose course or event is still there can be edited or kept.
  const editable = design.state === "draft" && Boolean(target);
  const title = target?.title ?? design.title ?? "";
  const item = target
    ? targetItem(target, timeZone)
    : { title, createdAt: null, startsAt: null, timeZone };
  const cardAspect = parseLook(design.look).style.coverAspect;
  // The admin is on her site's own host, so its pages are on this origin.
  const link =
    target?.path && typeof window !== "undefined"
      ? `${window.location.origin}${target.path}`
      : undefined;

  const [confirming, setConfirming] = useState(false);
  const draft = useCoverDraft({
    design,
    editable,
    generationsLeft: targets.generations_left,
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
  // What both views give the photo sources: the Photos drawer and the phone's controls.
  const photoSources = {
    cardAspect,
    inUse: targets.in_use,
    generationsLeft: draft.left,
    onGenerationStart: draft.countPhoto,
    onUsedUp: draft.photosUsedUp,
    onPick: draft.pick,
    onGenerating: draft.setGenerating,
    onBusy: (on: boolean) => draft.setWork("photos", on),
  };

  return (
    <>
      {desktop && editable ? (
        <Workspace
          draft={draft}
          design={design}
          cover={cover}
          item={item}
          title={title}
          noun={noun}
          size={size}
          onSize={setSize}
          cardAspect={cardAspect}
          selected={selected}
          onSelect={setSelected}
          set={set ?? null}
          photoSources={photoSources}
          others={others}
          timeZone={timeZone}
          notice={notice}
          onDiscard={() => setConfirming(true)}
          link={link}
          photoAi={Boolean(targets.photo_ai)}
          cutout={Boolean(targets.cutout)}
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
                {noun === "event"
                  ? t("editor.eventCover", {
                      kind: ta(`events.kinds.${design.target_kind}.label`),
                    })
                  : t(`editor.${noun}Cover`)}
              </p>
            </div>
            <DraftActions
              draft={draft}
              design={design}
              editable={editable}
              canCopy={Boolean(target)}
              noun={noun}
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
                  photoSources={photoSources}
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
