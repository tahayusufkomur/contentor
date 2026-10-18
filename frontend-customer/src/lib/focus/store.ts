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

export function setActiveCreation(state: FocusState | null) {
  active = state;
  emit();
}

/** Leave focus mode on the way out of a page; with ``id``, only when that is
 *  still the creation showing (0: the first question, before it exists). */
export function clearActiveCreation(id?: number) {
  if (active !== null && (id === undefined || active.id === id))
    setActiveCreation(null);
}

export const activeCreation = () => active;

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
