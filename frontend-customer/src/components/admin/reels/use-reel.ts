"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { errorMessage } from "@shared/hooks/async-runner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import {
  coverLink,
  deleteReel,
  downloadLink,
  getReel,
  renderReel,
  saveReel,
} from "@/lib/reels-api";
import { inverse, merged } from "@/lib/reels/studio";
import type { ReelDetail, ReelPatch } from "@/types/reels";

const TYPING_MS = 700;
const POLL_MS = 2500;

/** What she types: saved once typing stops. */
export interface Typed {
  title: string;
  caption: string;
  endText: string;
  label: string;
}

interface Step {
  undo: ReelPatch;
  redo: ReelPatch;
}

/** One reel being edited, for the reel editor and the video studio: every change shown at once and saved
 *  (what is typed once typing stops), the server's answer to an older change never overwriting a newer one;
 *  undo and redo; a video being made looked at until it is ready; its files' downloads, and its deletion. */
export function useReel(initial: ReelDetail) {
  const t = useTranslations("admin.reels.editor");
  const navigate = useNavigate();
  const [reel, setReel] = useState(initial);
  const [typed, setTypedState] = useState<Typed>({
    title: initial.title,
    caption: initial.caption,
    endText: initial.options.end_text,
    label: initial.cover.label,
  });
  const [saving, setSaving] = useState(false);
  const latest = useRef(0);
  const current = useRef(reel);
  current.current = reel;
  const done = useRef<Step[]>([]);
  const undone = useRef<Step[]>([]);
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const count = () =>
    setSteps({ undo: done.current.length, redo: undone.current.length });

  // Every change goes to the server, which answers with the reel as it will draw it (its cuts, crop and
  // translation); an answer to an older change never overwrites a newer one, and a refused one puts the
  // reel back as the server has it.
  const send = useCallback(
    (patch: ReelPatch) => {
      const ticket = ++latest.current;
      setReel((r) => merged(r, patch));
      setSaving(true);
      saveReel(reel.id, patch)
        .then((next) => {
          if (ticket === latest.current) setReel(next);
        })
        .catch((err) => {
          toast.error(errorMessage(err));
          getReel(reel.id)
            .then((next) => ticket === latest.current && setReel(next))
            .catch(() => undefined);
        })
        .finally(() => {
          if (ticket === latest.current) setSaving(false);
        });
    },
    [reel.id],
  );

  // What is typed is kept apart from the reel while it is typed: an undo puts it back in the field too.
  const saved = useRef(typed);
  const showTyped = useCallback((patch: ReelPatch) => {
    if (
      patch.title === undefined &&
      patch.caption === undefined &&
      patch.options?.end_text === undefined &&
      patch.cover?.label === undefined
    )
      return;
    const next = { ...saved.current };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.caption !== undefined) next.caption = patch.caption;
    if (patch.options?.end_text !== undefined)
      next.endText = patch.options.end_text;
    if (patch.cover?.label !== undefined) next.label = patch.cover.label;
    saved.current = next;
    setTypedState(next);
  }, []);

  // Not useAsyncAction: it drops a call while one is in flight, and edits come quicker than saves.
  const change = useCallback(
    (patch: ReelPatch) => {
      done.current.push({ undo: inverse(current.current, patch), redo: patch });
      undone.current = [];
      count();
      send(patch);
    },
    [send],
  );
  const replay = useCallback(
    (from: { current: Step[] }, to: { current: Step[] }, which: keyof Step) => {
      const step = from.current.pop();
      if (!step) return;
      to.current.push(step);
      count();
      showTyped(step[which]);
      send(step[which]);
    },
    [send, showTyped],
  );
  const undo = useCallback(() => replay(done, undone, "undo"), [replay]);
  const redo = useCallback(() => replay(undone, done, "redo"), [replay]);

  const setTyped = useCallback(
    (field: keyof Typed, value: string) =>
      setTypedState((was) => ({ ...was, [field]: value })),
    [],
  );
  useEffect(() => {
    const before = saved.current;
    if (
      before.title === typed.title &&
      before.caption === typed.caption &&
      before.endText === typed.endText &&
      before.label === typed.label
    )
      return;
    const timer = setTimeout(() => {
      const patch: ReelPatch = {};
      if (before.title !== typed.title) patch.title = typed.title;
      if (before.caption !== typed.caption) patch.caption = typed.caption;
      if (before.endText !== typed.endText)
        patch.options = { end_text: typed.endText };
      if (before.label !== typed.label) patch.cover = { label: typed.label };
      saved.current = typed;
      change(patch);
    }, TYPING_MS);
    return () => clearTimeout(timer);
  }, [typed, change]);

  // A video being made: look again until it is ready.
  useEffect(() => {
    if (reel.status !== "rendering") return;
    const timer = setInterval(() => {
      getReel(reel.id)
        .then((next) => {
          if (next.status === "rendering") return;
          setReel(next);
          if (next.status === "ready") toast.success(t("made"));
          else toast.error(next.error || t("notMade"));
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reel.status, reel.id, t]);

  const { run: make, loading: starting } = useAsyncAction(async () => {
    const next = await renderReel(reel.id);
    setReel((r) => ({ ...r, ...next, cover: r.cover })); // (the summary's cover lacks the brand)
  });
  const { run: download, loading: fetching } = useAsyncAction(async () => {
    const { url } = await downloadLink(reel.id);
    window.location.assign(url);
  });
  const { run: downloadCover, loading: fetchingCover } = useAsyncAction(
    async () => {
      const { url } = await coverLink(reel.id);
      window.location.assign(url);
    },
  );
  const { run: remove, loading: deleting } = useAsyncAction(async () => {
    await deleteReel(reel.id);
    toast.success(t("deleted"));
    navigate(`/admin/reels?video=${reel.video}`);
  });

  // The reel as it shows: what is typed is on its covers and end card before it is saved.
  const live = useMemo(
    () => ({
      ...reel,
      title: typed.title,
      cover: { ...reel.cover, title: typed.title, label: typed.label },
    }),
    [reel, typed.title, typed.label],
  );

  return {
    reel,
    live,
    typed,
    setTyped,
    saving,
    change,
    undo,
    redo,
    canUndo: steps.undo > 0,
    canRedo: steps.redo > 0,
    make,
    starting,
    download,
    fetching,
    downloadCover,
    fetchingCover,
    remove,
    deleting,
  };
}

export type ReelEditing = ReturnType<typeof useReel>;
