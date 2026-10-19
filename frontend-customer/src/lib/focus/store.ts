"use client";

import { useEffect, useSyncExternalStore } from "react";

import { fetchOverview, type FocusOverview, type FocusState } from "./api";

// Module-level, like lib/copilot/runs.ts: the new-course page, the course
// page, the dock and the shell share one overview and one active creation.

const OFF: FocusOverview = { enabled: false, first: {}, open: [] };

let overview: FocusOverview | null = null;
let inflight: Promise<void> | null = null;
let active: FocusState | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fetch the overview again (after a creation starts or ends). A failed
 *  fetch reads as "off": the studio then behaves exactly as without it. */
export function refreshFocusOverview(): Promise<void> {
  inflight ??= fetchOverview()
    .catch(() => overview ?? OFF)
    .then((next) => {
      overview = next;
      emit();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** null while the first fetch is under way. */
export function useFocusOverview(): FocusOverview | null {
  const value = useSyncExternalStore(
    subscribe,
    () => overview,
    () => null,
  );
  useEffect(() => {
    if (overview === null) void refreshFocusOverview();
  }, []);
  return value;
}

/** Her open creation of this kind for this record, if any. */
export function openCreationFor(
  value: FocusOverview | null,
  kind: string,
  recordId: number,
): number | null {
  return (
    value?.open.find((c) => c.kind === kind && c.record.id === recordId)?.id ??
    null
  );
}

// Bumped by every state set, so a poll that set out before a newer state
// (her tap, on the page or in the guide) cannot put the older one back.
let version = 0;
export const creationVersion = () => version;

// The cover step's pick and the photo row's page, shared by the page and the
// guide: a new round clears the pick, new words for the photo start the row over.
let coverPick: number | null = null;
let photoPage = 1;

export function setActiveCreation(state: FocusState | null) {
  const same = active?.id === state?.id;
  if (!same || active?.cover?.round !== state?.cover?.round) coverPick = null;
  if (!same || active?.cover?.query !== state?.cover?.query) photoPage = 1;
  active = state;
  version += 1;
  emit();
}

/** A reply lands only on the creation it was for: once she has left it
 *  (Save & leave, another page), it stays left. */
export function applyCreation(from: number, next: FocusState | null) {
  if (active?.id !== from) return false;
  setActiveCreation(next);
  return true;
}

export function setCoverPick(index: number | null) {
  coverPick = index;
  emit();
}

export const useCoverPick = (): number | null =>
  useSyncExternalStore(
    subscribe,
    () => coverPick,
    () => null,
  );

export function morePhotos() {
  photoPage += 1;
  emit();
}

// Whether "More photos" has a next page to fetch: set by the row on screen.
let canMorePhotos = false;

export function setCanMorePhotos(value: boolean) {
  if (value === canMorePhotos) return;
  canMorePhotos = value;
  emit();
}

export const useCanMorePhotos = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => canMorePhotos,
    () => false,
  );

export const usePhotoPage = (): number =>
  useSyncExternalStore(
    subscribe,
    () => photoPage,
    () => 1,
  );

/** Leave focus mode on the way out of a page; with ``id``, only when that is
 *  still the creation showing (0: the first question, before it exists). */
export function clearActiveCreation(id?: number) {
  if (active !== null && (id === undefined || active.id === id))
    setActiveCreation(null);
}

export const activeCreation = () => active;

// Her words from the assistant, kept for the new-course page's first screen.
// Read once: a reload of that page must not send them again.
let firstAnswer: string | null = null;

export function setFirstAnswer(text: string | null) {
  firstAnswer = text;
}

export function takeFirstAnswer(): string | null {
  const text = firstAnswer;
  firstAnswer = null;
  return text;
}

// Create-course cards that arrived in this session while she was on a courses
// page: the only ones that open focus mode by themselves, once each. A card
// from history, or one that arrived elsewhere, is never in here.
const liveCards = new Set<string>();

/** Courses list or a course page (not the new-course page itself). */
export const onCoursesPage = (path: string | null) =>
  /^\/admin\/courses(\/(?!new\/?$)[^/]+)?\/?$/.test(path ?? "");

/** Note the cards of replies that just arrived, if she is on a courses page. */
export function markLiveCards(
  path: string | null,
  replies: { cards?: { token: string }[] }[],
) {
  if (!onCoursesPage(path)) return;
  for (const reply of replies)
    for (const card of reply.cards ?? []) liveCards.add(card.token);
}

/** True once for a live card; a remount or a poll never claims it again. */
export const claimLiveCard = (token: string) => liveCards.delete(token);

// The open course form's save, for "Save & leave" (set while focus mode shows it).
let focusSave: (() => Promise<void>) | null = null;

export function setFocusSave(save: (() => Promise<void>) | null) {
  focusSave = save;
}

/** Save what she typed on the page; throws when the save fails. */
export const saveFocusEdits = (): Promise<void> =>
  focusSave ? focusSave() : Promise.resolve();

/** The creation focus mode is showing now; the dock and the shell follow it. */
export function useActiveCreation(): FocusState | null {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
}

export function focusProgress(state: Pick<FocusState, "steps">) {
  return {
    done: state.steps.filter((step) => step.done).length,
    total: state.steps.length,
  };
}
