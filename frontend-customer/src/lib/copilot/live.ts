"use client";

import { useEffect, useRef, useState } from "react";

import { markRunSeen } from "./api";
import { isActive, trackRun, unwatchRun, useRun, watchRun } from "./runs";
import { asSpecialist, type SpecialistKey } from "./team";
import type { RunEvent } from "./types";

/** What a page shows of a run's work on one record at a moment of its replay
 *  (team spec §6.3): each live field's text so far, the rows so far, and who
 *  is working. The data is already saved; this only paces its appearance. */
export interface LiveFrame {
  fields: Record<string, { value: string; typing: boolean }>;
  /** Each field's whole written value, shown yet or not (it is saved already). */
  written: Record<string, string>;
  rows: { title: string; lessons: string[]; typing: boolean }[];
  working: { specialist: SpecialistKey; label: string } | null;
  settled: boolean;
}

interface RowValue {
  title?: unknown;
  lessons?: unknown;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The frame ``elapsedMs`` into the replay: fields type in one after another
 *  at ``cps`` characters a second, then rows one by one (a row's title, then
 *  its lessons). Events for other records are left out. */
export function liveFrame(
  events: RunEvent[],
  record: string,
  elapsedMs: number,
  cps = 60,
): LiveFrame {
  let budget =
    elapsedMs === Infinity ? Infinity : Math.floor((elapsedMs * cps) / 1000);
  const frame: LiveFrame = {
    fields: {},
    written: {},
    rows: [],
    working: null,
    settled: false,
  };
  let started: LiveFrame["working"] = null;
  let stepDone = false;
  let complete = true;
  /** Reveal ``full`` against the budget: the part shown, or null when the
   *  replay has not reached it yet. */
  const take = (full: string): string | null => {
    if (!complete) return null;
    const shown = full.slice(0, Math.max(0, Math.min(full.length, budget)));
    budget -= full.length;
    if (shown.length < full.length) complete = false;
    return shown;
  };
  for (const event of events) {
    const data = event.data;
    if (event.type === "step") {
      if (data.state === "done") stepDone = true;
      else {
        started = {
          specialist: asSpecialist(data.specialist),
          label: text(data.label),
        };
        stepDone = false;
      }
      continue;
    }
    if (data.record !== record) continue;
    if (event.type === "field") {
      frame.written[text(data.name)] = text(data.value);
      const shown = take(text(data.value));
      if (shown === null) continue;
      frame.fields[text(data.name)] = {
        value: shown,
        typing: shown.length < text(data.value).length,
      };
    } else if (event.type === "row") {
      const value = (data.value ?? {}) as RowValue;
      const title = take(text(value.title));
      if (title === null) continue;
      const lessons: string[] = [];
      for (const lesson of Array.isArray(value.lessons) ? value.lessons : []) {
        const shown = take(text(lesson));
        if (shown === null) break;
        lessons.push(shown);
      }
      frame.rows.push({ title, lessons, typing: !complete });
    }
  }
  frame.settled = complete && stepDone;
  frame.working = started && !frame.settled ? started : null;
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
  frameOf: (events: RunEvent[], elapsedMs: number) => F,
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
  const frame =
    runId === null ? null : frameOf(events, instant ? Infinity : elapsed);
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
): LiveFrame | null {
  return useReplay(
    runId,
    "content",
    (events, ms) => liveFrame(events, record, ms),
    (events) =>
      events.some(
        (e) =>
          (e.type === "field" || e.type === "row") && e.data.record === record,
      ),
  );
}
