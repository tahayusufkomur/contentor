"use client";

// The photo studio's editor for one design: a draft is edited with the simple controls, saves itself, and
// becomes its course's or event's cover only when she keeps it (nothing on the site changes before that).
// A kept or retired design opens read-only, and "Edit a copy" starts a draft from it.
//
// Edits live in an EditHistory of recipes (Undo and Redo cover all of them). What the server answers to a
// save is never written back into it: the server trims text, and adopting that would eat the space she
// has just typed.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { CoversStrip } from "@/components/studio/covers-strip";
import { SimpleControls } from "@/components/studio/simple-controls";
import { SizePreviews } from "@/components/studio/size-previews";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";
import { useTenant } from "@/hooks/use-tenant";
import { undoCopilotAction } from "@/lib/copilot/api";
import { createAutosave } from "@/lib/covers/autosave";
import { editHistory, type EditorAction } from "@/lib/covers/editor";
import { openCoverStudio } from "@/lib/covers/open-studio";
import { parseLook } from "@/lib/covers/palette";
import { targetItem } from "@/lib/covers/targets";
import {
  deleteDesign,
  getDesign,
  getTargets,
  keepDesign,
  listDesigns,
  saveDesign,
} from "@/lib/designs-api";
import {
  canRedo,
  canUndo,
  createHistory,
  redo,
  undo,
  type EditHistory,
} from "@/lib/logo/history";
import {
  announceAssistantApplied,
  announceSiteUpdated,
} from "@/lib/site-events";
import { ApiError } from "@/types/api";
import type {
  CoverDesign,
  CoverRecipe,
  CoverSize,
  DesignRecord,
  DesignTargets,
} from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** Signed photo links last an hour: a link that fails is replaced from the server, but not more often
 *  than this, so a photo that is really gone does not make the page ask for ever. */
const PHOTO_REFRESH_MS = 60_000;

/** What the editor shows while the design and her covers load: the shape of the page. */
export function EditorSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <Skeleton className="aspect-video w-full" />
        <SkeletonForm fields={5} />
      </div>
    </div>
  );
}

type SaveState = "saved" | "saving" | "error";

function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  const t = useTranslations("admin.studio.editor");
  return (
    <span
      role="status"
      className="min-w-[6.5rem] text-xs text-muted-foreground sm:text-right"
    >
      {state === "saving" && t("saving")}
      {state === "saved" && t("saved")}
      {state === "error" && (
        <>
          {t("saveFailed")}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            {t("retry")}
          </button>
        </>
      )}
    </span>
  );
}

/** Asks before a draft is thrown away. "Keep editing" has the focus: Enter does not destroy anything. */
function DiscardDialog({
  title,
  discarding,
  onDiscard,
  onCancel,
}: {
  title: string;
  discarding: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.studio.editor");
  const headingId = useId();
  const bodyId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("discardCancel")}
          onClick={onCancel}
          className="absolute inset-0 bg-black/50"
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-describedby={bodyId}
          className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl"
        >
          <h2 id={headingId} className="text-base font-semibold">
            {t("discardTitle")}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm text-muted-foreground">
            {t("discardBody", { title })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={discarding}
              autoFocus
            >
              {t("discardCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={onDiscard}
              loading={discarding}
            >
              {t("discard")}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
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
  const navigate = useNavigate();
  const router = useRouter();
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

  const [history, setHistory] = useState<EditHistory<CoverRecipe>>(() =>
    createHistory(design.recipe),
  );
  // Handlers read the history from here: two edits in one tick must both land.
  const historyRef = useRef(history);
  const recipe = history.present;
  const [photos, setPhotos] = useState(design.photos);
  const [size, setSize] = useState<CoverSize>("card");
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [confirming, setConfirming] = useState(false);
  // From a Keep or an Undo until the reload has replaced this editor: nothing more can be done to it.
  const [reloading, setReloading] = useState(false);

  const autosave = useMemo(
    () =>
      createAutosave(async (saving) => {
        try {
          await saveDesign(design.id, saving);
          // more edits may have been made while it was on the way
          setSaveState(
            historyRef.current.present === saving ? "saved" : "saving",
          );
        } catch (error) {
          setSaveState("error");
          throw error;
        }
      }),
    [design.id],
  );
  // Leaving the page (or Keep reloading it) saves what is still waiting.
  useEffect(() => {
    return () => {
      void autosave.flush().catch(() => {});
    };
  }, [autosave]);
  // Closing the tab with edits not yet saved asks first.
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // older browsers ask only for this
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const apply = (next: EditHistory<CoverRecipe>) => {
    if (next === historyRef.current) return;
    historyRef.current = next;
    setHistory(next);
    setSaveState("saving");
    autosave.schedule(next.present);
  };
  const edit = (action: EditorAction) =>
    apply(editHistory(historyRef.current, action));

  // A photo she picks draws at once, before the next save tells the server about it.
  const pick = (photo: { id: string; url: string }) => {
    setPhotos((now) => ({ ...now, [photo.id]: photo.url }));
    edit({ type: "photo", id: photo.id });
  };

  const lastRefresh = useRef(0);
  const refreshPhotos = () => {
    if (Date.now() - lastRefresh.current < PHOTO_REFRESH_MS) return;
    lastRefresh.current = Date.now();
    getDesign(design.id)
      .then((fresh) => setPhotos((now) => ({ ...now, ...fresh.photos })))
      .catch(() => {});
  };

  const undoKeep = async (auditId: number) => {
    try {
      const res = await undoCopilotAction(auditId);
      announceSiteUpdated();
      announceAssistantApplied({
        kind: `undo:${res.undone}`,
        id: res.id ?? undefined,
      });
      router.refresh();
      toast.success(ta("dock.undoneToast"));
      setReloading(true);
      reload();
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 400
          ? ta("dock.undoRefused")
          : ta("dock.undoFailed"),
      );
    }
  };

  const { run: keep, loading: keeping } = useAsyncAction(async () => {
    // The server keeps what it has saved: the last edits must be there first.
    await autosave.flush();
    const done = await keepDesign(design.id);
    const auditId = done.audit_id;
    toast.success(t("editor.kept", { title: done.result.title }), {
      // long enough to change her mind
      duration: 10_000,
      action:
        auditId === null
          ? undefined
          : { label: ta("dock.undo"), onClick: () => void undoKeep(auditId) },
    });
    router.refresh();
    setReloading(true);
    reload();
  });

  const { run: discard, loading: discarding } = useAsyncAction(async () => {
    await deleteDesign(design.id);
    // nothing is saved to a draft that is gone
    autosave.cancel();
    navigate("/admin/studio");
  });

  const { run: editCopy, loading: copying } = useAsyncAction(() =>
    openCoverStudio(design, navigate, design.id),
  );

  const busy = keeping || discarding || copying || reloading;
  const cover: CoverDesign = {
    id: design.id,
    recipe,
    photos,
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

  return (
    <div className="space-y-4 md:space-y-6">
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
        {/* On a phone the saving state and Undo sit above the buttons, which share the row below. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {editable && (
            <div className="flex items-center gap-1">
              <SaveStatus
                state={saveState}
                onRetry={() => void autosave.flush().catch(() => {})}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("editor.undo")}
                disabled={!canUndo(history) || busy}
                onClick={() => apply(undo(historyRef.current))}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("editor.redo")}
                disabled={!canRedo(history) || busy}
                onClick={() => apply(redo(historyRef.current))}
              >
                <Redo2 />
              </Button>
            </div>
          )}
          <div className="flex w-full gap-2 sm:w-auto">
            {design.state === "draft" && (
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={keeping || copying}
                onClick={() => setConfirming(true)}
              >
                {t("editor.discard")}
              </Button>
            )}
            {editable && (
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => void keep()}
                loading={keeping}
                disabled={discarding}
              >
                {isCourse ? t("editor.keepCourse") : t("editor.keepEvent")}
              </Button>
            )}
            {design.state !== "draft" && target && (
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => void editCopy()}
                loading={copying}
              >
                {t("editCopy")}
              </Button>
            )}
          </div>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">{notice}</p>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <div
          className="contents lg:flex lg:flex-col lg:gap-4"
          onErrorCapture={refreshPhotos}
        >
          <SizePreviews
            design={cover}
            item={item}
            size={size}
            onSize={setSize}
            generating={generating}
          />
          <CoversStrip
            targets={others}
            size={size}
            cardAspect={cardAspect}
            timeZone={timeZone}
          />
        </div>
        {editable && (
          <fieldset
            disabled={busy}
            className="order-1 min-w-0 lg:order-none lg:rounded-lg lg:border lg:p-4"
          >
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
              edit={edit}
              photoSources={{
                cardAspect,
                inUse: targets.in_use,
                generationsLeft: targets.generations_left,
                onPick: pick,
                onGenerating: setGenerating,
              }}
            />
          </fieldset>
        )}
      </div>

      {confirming && (
        <DiscardDialog
          title={title}
          discarding={discarding}
          onDiscard={() => void discard()}
          onCancel={() => !discarding && setConfirming(false)}
        />
      )}
    </div>
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
    Promise.all([getDesign(designId), getTargets(), listDesigns("kept")])
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
