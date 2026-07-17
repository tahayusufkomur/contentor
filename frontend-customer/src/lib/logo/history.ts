// Pure undo/redo reducer for the Logo Studio editor's single-recipe draft.
// No React, no side effects — logo-studio.tsx owns the state slot and calls
// these functions directly. See
// docs/superpowers/plans/2026-07-10-logo-studio-session-undo-refine.md.

const COALESCE_WINDOW_MS = 400;
const MAX_ENTRIES = 100;

interface HistoryEntry<T> {
  value: T;
  key: string | null;
  at: number;
}

export interface EditHistory<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
}

export function createHistory<T>(initial: T): EditHistory<T> {
  return { past: [], present: initial, future: [] };
}

/** Pushes `next` as the new present. If `coalesceKey` matches the top of
 * `past` and the gap since that entry is under the coalesce window, the top
 * entry is replaced instead of a new one being added — so a slider drag or
 * a burst of keystrokes on the same field becomes one undo step. Any
 * push always clears `future` (a fresh edit branches off, redo is gone). */
export function push<T>(
  history: EditHistory<T>,
  next: T,
  coalesceKey: string | null = null,
  now: number = Date.now(),
): EditHistory<T> {
  const top = history.past[history.past.length - 1];
  const coalesce =
    coalesceKey !== null &&
    top !== undefined &&
    top.key === coalesceKey &&
    now - top.at < COALESCE_WINDOW_MS;
  // Coalescing keeps the ORIGINAL pre-burst value as the undo target (only
  // the timestamp refreshes, extending the window) — otherwise each
  // coalesced push would overwrite it with the previous keystroke's
  // intermediate value, and undo would only ever step back one keystroke.
  const entry: HistoryEntry<T> = coalesce
    ? { value: top!.value, key: coalesceKey, at: now }
    : { value: history.present, key: coalesceKey, at: now };
  const past = coalesce
    ? [...history.past.slice(0, -1), entry]
    : [...history.past, entry].slice(-MAX_ENTRIES);
  return { past, present: next, future: [] };
}

export function undo<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: previous.value,
    future: [
      { value: history.present, key: previous.key, at: previous.at },
      ...history.future,
    ],
  };
}

export function redo<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0]!;
  return {
    past: [
      ...history.past,
      { value: history.present, key: next.key, at: next.at },
    ],
    present: next.value,
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: EditHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: EditHistory<T>): boolean {
  return history.future.length > 0;
}

/** Replaces the whole history with a fresh baseline — no past, no future.
 * Used whenever the editor step is (re-)entered with a new starting recipe
 * (a different history than "this recipe is the first present value",
 * which is what createHistory already does — reset exists as the named,
 * intention-revealing call for "throw away an existing history"). */
export function reset<T>(baseline: T): EditHistory<T> {
  return createHistory(baseline);
}
