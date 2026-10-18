"use client";

// The draft behind the photo studio's editor: the cover being edited, its history, its saving, and what
// can be done to it (Keep, Discard, Edit a copy). The phone's simple controls and the computer's canvas
// are two views over this one state.
//
// Edits live in an EditHistory of recipes (Undo and Redo cover all of them). What the server answers to a
// save is never written back into it: the server trims text, and adopting that would eat the space she
// has just typed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { undoCopilotAction } from "@/lib/copilot/api";
import { createAutosave } from "@/lib/covers/autosave";
import { editHistory, type EditorAction } from "@/lib/covers/editor";
import { openCoverStudio } from "@/lib/covers/open-studio";
import {
  countWork,
  isWorking,
  type WorkKind,
  type Working,
} from "@/lib/covers/work";
import {
  deleteDesign,
  getDesign,
  keepDesign,
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
import type { CoverRecipe, DesignRecord } from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

export type SaveState = "saved" | "saving" | "error";

/** Signed photo links last an hour: a link that fails is replaced from the server, but not more often
 *  than this, so a photo that is really gone does not make the page ask for ever. */
const PHOTO_REFRESH_MS = 60_000;

const TEXT_INPUT = /^(text|search|url|tel|email|password|number)$/;
/** Whether a key went to a field she types in, which has an undo of its own. */
function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement && TEXT_INPUT.test(target.type)))
  );
}

export function useCoverDraft({
  design,
  editable,
  generationsLeft,
  paused = false,
  reload,
}: {
  design: DesignRecord;
  /** A draft whose course or event is still there: the only one that can be edited or kept. */
  editable: boolean;
  /** New photos she can still make this month, as of the page load; the draft keeps the count from there. */
  generationsLeft: number;
  /** Something modal is open (the discard question): Cmd-Z waits. */
  paused?: boolean;
  /** Loads the design again, which replaces this editor (after Keep, and after Undo from its toast). */
  reload: () => void;
}) {
  const t = useTranslations("admin.studio");
  const ta = useTranslations("admin");
  const navigate = useNavigate();
  const router = useRouter();

  const [history, setHistory] = useState<EditHistory<CoverRecipe>>(() =>
    createHistory(design.recipe),
  );
  // Handlers read the history from here: two edits in one tick must both land.
  const historyRef = useRef(history);
  const [photos, setPhotos] = useState(design.photos);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  // From a Keep or an Undo until the reload has replaced this editor: nothing more can be done to it.
  const [reloading, setReloading] = useState(false);
  // From a Discard that went through until the page has left: the draft is gone, so nothing more can be done.
  const [discarded, setDiscarded] = useState(false);
  // Photos on their way, by where they come from: a photo being made, uploaded or copied. The work reports
  // them itself (lib/covers/work.ts), so leaving the drawer it started from does not lift the hold.
  const [working, setWorking] = useState<Working>({});
  // The month's new photos left. It lives here, not in the Photos drawer, which is gone while she is
  // elsewhere: opening it again would show the count of the page load.
  const [left, setLeft] = useState(generationsLeft);

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
  // False from the moment this editor is gone: she left, or a reload is replacing it.
  const alive = useRef(true);
  useEffect(() => {
    // set here as well: in development React runs an effect, its cleanup and the effect again
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Leaving the page (or Keep reloading it) saves what is still waiting. She is no longer looking at the
  // saving state then, so a save that fails is said in a toast.
  const say = useRef(t);
  say.current = t;
  useEffect(() => {
    return () => {
      void autosave
        .flush()
        .catch(() => toast.error(say.current("editor.leftUnsaved")));
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
    // A photo can arrive late: an upload, a library copy or a new photo that finishes after she left, or
    // after Keep. Taking it then would start a save nobody cancels: refused (400) once the design is kept,
    // a 404 once it is discarded, and a quiet edit of a draft she is no longer looking at otherwise. (The
    // guard is a ref, read when the photo lands: a flag in state would be the one the upload started with.)
    if (!alive.current) return;
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

  /** The editor is about to be replaced by the design as the server has it. */
  const startReload = () => {
    alive.current = false;
    setReloading(true);
    reload();
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
      startReload();
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
    startReload();
  });

  const { run: discard, loading: discarding } = useAsyncAction(async () => {
    await deleteDesign(design.id);
    // nothing is saved to a draft that is gone, and a photo that lands now is not put on it
    autosave.cancel();
    alive.current = false;
    setDiscarded(true);
    navigate("/admin/studio");
  });

  const { run: editCopy, loading: copying } = useAsyncAction(() =>
    openCoverStudio(design, navigate, design.id),
  );

  /** Nothing can be changed while the draft is being kept, discarded, copied or replaced. */
  const busy = keeping || discarding || copying || reloading || discarded;
  /** Keep and Discard also wait for a photo on its way: it would land on a cover that is gone or kept. */
  const locked = busy || isWorking(working);
  const setWork = useCallback(
    (kind: WorkKind, on: boolean) =>
      setWorking((now) => countWork(now, kind, on)),
    [],
  );
  const countPhoto = useCallback(() => setLeft((n) => Math.max(0, n - 1)), []);
  const photosUsedUp = useCallback(() => setLeft(0), []);

  // Cmd-Z and Shift-Cmd-Z (Ctrl-Z, Ctrl-Shift-Z and Ctrl-Y elsewhere) step the history, unless she is typing
  // in a field, which has an undo of its own. The canvas handles its own keys (arrows, Delete, Cmd-D).
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (busy || paused || typingIn(e.target)) return;
      const key = e.key.toLowerCase();
      const redoing =
        (key === "z" && e.shiftKey) || (key === "y" && !e.metaKey);
      if (!redoing && !(key === "z" && !e.shiftKey)) return;
      e.preventDefault();
      apply(redoing ? redo(historyRef.current) : undo(historyRef.current));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return {
    recipe: history.present,
    photos,
    saveState,
    edit,
    pick,
    undo: () => apply(undo(historyRef.current)),
    redo: () => apply(redo(historyRef.current)),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    /** Saves what is waiting, for the "try again" of a failed save. */
    retrySave: () => void autosave.flush().catch(() => {}),
    refreshPhotos,
    /** True while a new photo is being made, so the canvas can hold the place of its photo. */
    generating,
    setGenerating,
    /** A photo source reports that it is making, uploading or copying a photo (or has finished). */
    setWork,
    /** Whether a photo from that source is on its way. */
    isWorking: (kind: WorkKind) => isWorking(working, kind),
    /** New photos she can still make this month. */
    left,
    /** A new photo has started: it counts against the month. */
    countPhoto,
    /** The server says the month's new photos are all used. */
    photosUsedUp,
    keep,
    keeping,
    discard,
    /** From the click until the page has left: the draft is being thrown away, or already is. */
    discarding: discarding || discarded,
    editCopy,
    copying,
    busy,
    locked,
  };
}

export type CoverDraft = ReturnType<typeof useCoverDraft>;
