"use client";

import { useEffect, useRef, useState } from "react";

import { markRunSeen } from "./api";
import { isActive, trackRun, unwatchRun, useRun, watchRun } from "./runs";
import { asSpecialist, type SpecialistKey } from "./team";
import type { RunEvent } from "./types";

export interface LiveBaseline {
  fields?: Record<string, string>;
  modules?: { title: string; lessons: string[] }[];
}

export interface LiveRow {
  title: string;
  lessons: string[];
  typing: boolean;
  changed?: boolean;
  titleTyping?: boolean;
  changedLessons?: boolean[];
  lessonTyping?: boolean[];
  baseIndex?: number | null;
  lessonBaseIndices?: (number | null)[];
}

/** What a page shows of a run's work on one record at a moment of its replay
 *  (team spec §6.3): each live field's text so far, the rows so far, and who
 *  is working. The data is already saved; this only paces its appearance. */
export interface LiveFrame {
  fields: Record<string, { value: string; typing: boolean }>;
  /** Each field's whole written value, shown yet or not (it is saved already). */
  written: Record<string, string>;
  rows: LiveRow[];
  working: { specialist: SpecialistKey; label: string } | null;
  settled: boolean;
}

interface RowValue {
  title?: unknown;
  lessons?: unknown;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const norm = (s: string) => s.trim().toLowerCase();

function matchModules(
  targets: { title: string; lessons: string[] }[],
  base: { title: string; lessons: string[] }[],
): (number | null)[] {
  const result: (number | null)[] = new Array(targets.length).fill(null);
  const used = new Set<number>();

  for (let r = 0; r < targets.length; r++) {
    const tTitle = norm(targets[r].title);
    const b = base.findIndex(
      (m, idx) => !used.has(idx) && norm(m.title) === tTitle,
    );
    if (b !== -1) {
      result[r] = b;
      used.add(b);
    }
  }

  for (let r = 0; r < targets.length; r++) {
    if (result[r] !== null) continue;
    const tLessons = new Set(targets[r].lessons.map(norm));
    let bestIdx = -1;
    let bestScore = 0;
    for (let b = 0; b < base.length; b++) {
      if (used.has(b)) continue;
      const score = base[b].lessons.filter((l) => tLessons.has(norm(l))).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = b;
      }
    }
    if (bestIdx !== -1) {
      result[r] = bestIdx;
      used.add(bestIdx);
    } else if (
      r < base.length &&
      !used.has(r) &&
      targets.length <= base.length
    ) {
      result[r] = r;
      used.add(r);
    }
  }

  return result;
}

function matchLessons(
  targetLessons: string[],
  baseLessons: string[],
): (number | null)[] {
  const result: (number | null)[] = new Array(targetLessons.length).fill(null);
  const used = new Set<number>();

  for (let l = 0; l < targetLessons.length; l++) {
    const tTitle = norm(targetLessons[l]);
    const b = baseLessons.findIndex(
      (bl, idx) => !used.has(idx) && norm(bl) === tTitle,
    );
    if (b !== -1) {
      result[l] = b;
      used.add(b);
    }
  }

  const unusedBase: number[] = [];
  for (let b = 0; b < baseLessons.length; b++) {
    if (!used.has(b)) unusedBase.push(b);
  }
  let u = 0;
  for (let l = 0; l < targetLessons.length && u < unusedBase.length; l++) {
    if (result[l] === null) {
      result[l] = unusedBase[u++];
    }
  }

  return result;
}

/** The character budget and step bookkeeping every replay frame shares:
 *  ``take`` reveals a text against the budget (null once the replay has not
 *  reached it), ``step`` follows the run's start/done steps, and ``settle``
 *  says whether it is over (``ended``: the run itself finished, with or
 *  without a done step) and who is still working. */
export function replayClock(elapsedMs: number, cps = 60) {
  let budget =
    elapsedMs === Infinity ? Infinity : Math.floor((elapsedMs * cps) / 1000);
  let started: { specialist: SpecialistKey; label: string } | null = null;
  let stepDone = false;
  let complete = true;
  return {
    get complete() {
      return complete;
    },
    take(full: string): string | null {
      if (!complete) return null;
      const shown = full.slice(0, Math.max(0, Math.min(full.length, budget)));
      budget -= full.length;
      if (shown.length < full.length) complete = false;
      return shown;
    },
    step(data: RunEvent["data"]) {
      if (data.state === "done") stepDone = true;
      else {
        started = {
          specialist: asSpecialist(data.specialist),
          label: text(data.label),
        };
        stepDone = false;
      }
    },
    settle(ended = false) {
      const settled = complete && (stepDone || ended);
      return { settled, working: started && !settled ? started : null };
    },
  };
}

/** The frame ``elapsedMs`` into the replay: fields type in one after another
 *  at ``cps`` characters a second, then rows one by one (a row's title, then
 *  its lessons). Events for other records are left out. When ``baseline`` is
 *  given (a redraft), unchanged fields, modules and lessons stay in place
 *  without consuming the typing budget, and only changes animate. */
export function liveFrame(
  events: RunEvent[],
  record: string,
  elapsedMs: number,
  cps = 60,
  baseline?: LiveBaseline,
): LiveFrame {
  const clock = replayClock(elapsedMs, cps);
  const frame: LiveFrame = {
    fields: {},
    written: {},
    rows: [],
    working: null,
    settled: false,
  };
  const targetRows = baseline?.modules
    ? events
        .filter((e) => e.type === "row" && e.data.record === record)
        .map((e) => {
          const value = (e.data.value ?? {}) as RowValue;
          return {
            title: text(value.title),
            lessons: (Array.isArray(value.lessons) ? value.lessons : []).map(
              text,
            ),
          };
        })
    : [];
  const modMatch = baseline?.modules
    ? matchModules(targetRows, baseline.modules)
    : [];
  let rowIdx = 0;

  for (const event of events) {
    const data = event.data;
    if (event.type === "step") {
      clock.step(data);
      continue;
    }
    if (data.record !== record) continue;
    if (event.type === "field") {
      const name = text(data.name);
      const val = text(data.value);
      frame.written[name] = val;
      if (baseline?.fields && baseline.fields[name] === val) continue;
      const shown = clock.take(val);
      if (shown === null) continue;
      frame.fields[name] = {
        value: shown,
        typing: shown.length < val.length,
      };
    } else if (event.type === "row") {
      if (!baseline?.modules) {
        const value = (data.value ?? {}) as RowValue;
        const title = clock.take(text(value.title));
        if (title === null) continue;
        const lessons: string[] = [];
        for (const lesson of Array.isArray(value.lessons)
          ? value.lessons
          : []) {
          const shown = clock.take(text(lesson));
          if (shown === null) break;
          lessons.push(shown);
        }
        frame.rows.push({ title, lessons, typing: !clock.complete });
        continue;
      }

      const rIdx = rowIdx++;
      const target = targetRows[rIdx];
      const bIdx = modMatch[rIdx] ?? null;
      const baseMod = bIdx !== null ? baseline.modules[bIdx] : null;

      let title = target.title;
      let titleTyping = false;
      let titleChanged = false;
      if (!baseMod || norm(baseMod.title) !== norm(target.title)) {
        const shown = clock.take(target.title);
        if (shown === null) {
          if (!baseMod) continue;
          title = baseMod.title;
        } else {
          title = shown;
          titleTyping = shown.length < target.title.length;
          titleChanged = true;
        }
      }

      const lessonMatch = baseMod
        ? matchLessons(target.lessons, baseMod.lessons)
        : new Array<number | null>(target.lessons.length).fill(null);

      const lessons: string[] = [];
      const changedLessons: boolean[] = [];
      const lessonTyping: boolean[] = [];
      const lessonBaseIndices: (number | null)[] = [];

      for (let l = 0; l < target.lessons.length; l++) {
        const fullLesson = target.lessons[l];
        const blIdx = lessonMatch[l];
        const unchanged =
          blIdx !== null &&
          baseMod !== null &&
          norm(baseMod.lessons[blIdx]) === norm(fullLesson);
        if (unchanged) {
          lessons.push(fullLesson);
          changedLessons.push(false);
          lessonTyping.push(false);
          lessonBaseIndices.push(blIdx);
        } else {
          const shown = clock.take(fullLesson);
          if (shown === null) {
            if (blIdx !== null && baseMod !== null) {
              lessons.push(baseMod.lessons[blIdx]);
              changedLessons.push(false);
              lessonTyping.push(false);
              lessonBaseIndices.push(blIdx);
            }
          } else {
            lessons.push(shown);
            changedLessons.push(true);
            lessonTyping.push(shown.length < fullLesson.length);
            lessonBaseIndices.push(blIdx);
          }
        }
      }

      const removedLesson =
        baseMod !== null && target.lessons.length < baseMod.lessons.length;
      const typing = titleTyping || lessonTyping.some(Boolean);
      const changed =
        baseMod === null ||
        titleChanged ||
        changedLessons.some(Boolean) ||
        removedLesson;

      frame.rows.push({
        title,
        lessons,
        typing,
        changed,
        titleTyping,
        changedLessons,
        lessonTyping,
        baseIndex: bIdx,
        lessonBaseIndices,
      });
    }
  }
  Object.assign(frame, clock.settle());
  return frame;
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The replay of ``runId``'s events as ``frameOf`` frames (null without a
 *  run). The clock starts when ``reveals`` first holds (the first field or row
 *  to type); a run that was already over before this page saw it working shows
 *  at once, as does everything under reduced motion. While it plays, the run
 *  is the page's: no "ready for you" for it. */
export function useReplay<F extends { settled: boolean }>(
  runId: number | null,
  specialist: SpecialistKey,
  frameOf: (events: RunEvent[], elapsedMs: number, ended: boolean) => F,
  reveals: (events: RunEvent[]) => boolean,
): F | null {
  const run = useRun(runId ?? undefined);
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef<{ run: number | null; start: number | null }>({
    run: null,
    start: null,
  });
  const sawActive = useRef(false);

  useEffect(() => {
    if (runId === null) return;
    trackRun(runId, specialist);
    watchRun(runId);
    clock.current = { run: runId, start: null };
    sawActive.current = false;
    setElapsed(0);
    return () => unwatchRun(runId);
  }, [runId, specialist]);

  if (run && run.lastSeq > 0 && isActive(run.status)) sawActive.current = true;
  const events = run?.events ?? [];
  const revealing = reveals(events);
  const instant =
    reducedMotion() ||
    (revealing && !sawActive.current && !!run && !isActive(run.status));
  const ended = !!run && !isActive(run.status);
  const frame =
    runId === null
      ? null
      : frameOf(events, instant ? Infinity : elapsed, ended);
  const settled = frame?.settled ?? false;

  useEffect(() => {
    if (!revealing || instant || settled) return;
    if (clock.current.start === null) clock.current.start = performance.now();
    let raf = 0;
    const step = () => {
      setElapsed(performance.now() - (clock.current.start ?? 0));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [revealing, instant, settled]);

  useEffect(() => {
    if (settled && runId !== null) void markRunSeen(runId).catch(() => {});
  }, [settled, runId]);

  return frame;
}

/** The live frame of ``runId``'s work on ``record``. */
export function useLiveRecord(
  record: string,
  runId: number | null,
  baseline?: LiveBaseline,
): LiveFrame | null {
  return useReplay(
    runId,
    "content",
    (events, ms) => liveFrame(events, record, ms, 60, baseline),
    (events) =>
      events.some(
        (e) =>
          (e.type === "field" || e.type === "row") && e.data.record === record,
      ),
  );
}
