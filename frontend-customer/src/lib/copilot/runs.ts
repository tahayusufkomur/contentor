"use client";

import { useMemo, useSyncExternalStore } from "react";

import { fetchRun } from "./api";
import type { SpecialistKey } from "./team";
import type { CopilotDone, RunDetail, RunStatus } from "./types";

/** What the studio knows of one of the team's runs. */
export interface RunState {
  id: number;
  status: RunStatus;
  specialist: SpecialistKey;
  chat: number | null;
  /** The last event folded in; the next poll asks for the ones after it. */
  lastSeq: number;
  reply?: CopilotDone;
}

const ACTIVE = new Set<RunStatus>(["queued", "thinking", "working"]);

export const isActive = (status: RunStatus) => ACTIVE.has(status);

/** Fold one poll's answer into the run. Events after lastSeq are new; an
 * overlapping poll's repeats are ignored. */
export function applyRun(
  prev: RunState | undefined,
  detail: RunDetail,
): RunState {
  const next: RunState = {
    ...(prev ?? { id: detail.id, lastSeq: 0 }),
    status: detail.status,
    specialist: detail.specialist,
    chat: detail.chat,
  };
  for (const event of detail.events) {
    if (event.seq <= next.lastSeq) continue;
    next.lastSeq = event.seq;
    if (event.type === "reply") next.reply = event.data.payload as CopilotDone;
  }
  return next;
}

const BACKOFF = [700, 1500, 3000, 6000, 10000];

/** Sub-second while all is well; slower after each failed poll. */
export const pollDelay = (errors: number) =>
  BACKOFF[Math.min(errors, BACKOFF.length - 1)];

// One store for the whole studio (panel, toasts, later the pages), the
// repo's module-level idiom (see lib/setup-assistant.ts).
let runs: ReadonlyMap<number, RunState> = new Map();
const listeners = new Set<() => void>();
const finishedListeners = new Set<(run: RunState) => void>();
const watchers = new Map<number, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let errors = 0;
let ticking = false;

function commit(next: ReadonlyMap<number, RunState>) {
  runs = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const visible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

const hasActive = () => [...runs.values()].some((r) => isActive(r.status));

function schedule(delay: number) {
  if (typeof window === "undefined") return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void tick().then(() => {
      if (hasActive() && visible()) schedule(pollDelay(errors));
    });
  }, delay);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (visible() && hasActive()) schedule(0);
  });
}

/** Follow a run until it ends. */
export function trackRun(
  id: number,
  specialist: SpecialistKey,
  chat: number | null = null,
) {
  if (!runs.has(id)) {
    const next = new Map(runs);
    next.set(id, { id, status: "queued", specialist, chat, lastSeq: 0 });
    commit(next);
  }
  schedule(0);
}

/** One poll: the new events of every active run, while the tab is visible. */
export async function tick(): Promise<void> {
  if (ticking || !visible()) return;
  const active = [...runs.values()].filter((r) => isActive(r.status));
  if (active.length === 0) return;
  ticking = true;
  try {
    const answers = await Promise.allSettled(
      active.map((r) => fetchRun(r.id, r.lastSeq)),
    );
    const next = new Map(runs);
    const finished: RunState[] = [];
    let failed = false;
    answers.forEach((answer, i) => {
      const prev = next.get(active[i].id);
      if (!prev) return;
      let merged: RunState;
      if (answer.status === "fulfilled") {
        merged = applyRun(prev, answer.value);
      } else if ((answer.reason as { status?: number })?.status === 404) {
        merged = { ...prev, status: "failed" }; // gone (pruned, or not hers)
      } else {
        failed = true;
        return;
      }
      next.set(merged.id, merged);
      if (isActive(prev.status) && !isActive(merged.status))
        finished.push(merged);
    });
    errors = failed ? errors + 1 : 0;
    commit(next);
    finished.forEach((run) => finishedListeners.forEach((cb) => cb(run)));
  } finally {
    ticking = false;
  }
}

export function useRun(id: number | undefined): RunState | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (id === undefined ? undefined : runs.get(id)),
    () => undefined,
  );
}

const NO_RUNS: ReadonlyMap<number, RunState> = new Map();

/** Every run the studio follows; a new map whenever one changes. */
export function useRuns(): ReadonlyMap<number, RunState> {
  return useSyncExternalStore(
    subscribe,
    () => runs,
    () => NO_RUNS,
  );
}

/** The specialists working right now, for the pulsing faces. */
export function useBusySpecialists(): SpecialistKey[] {
  const all = useRuns();
  return useMemo(
    () => [
      ...new Set(
        [...all.values()]
          .filter((r) => isActive(r.status))
          .map((r) => r.specialist),
      ),
    ],
    [all],
  );
}

/** Called once for each run that ends while the studio follows it. */
export function onRunFinished(cb: (run: RunState) => void) {
  finishedListeners.add(cb);
  return () => {
    finishedListeners.delete(cb);
  };
}

/** The panel shows this run's reply right now: no "ready for you" for it. */
export function watchRun(id: number) {
  watchers.set(id, (watchers.get(id) ?? 0) + 1);
}

export function unwatchRun(id: number) {
  const left = (watchers.get(id) ?? 0) - 1;
  if (left > 0) watchers.set(id, left);
  else watchers.delete(id);
}

export const isWatched = (id: number) => watchers.has(id);
