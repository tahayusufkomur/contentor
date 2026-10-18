"use client";

import { replayClock, useReplay } from "@/lib/copilot/live";
import type { SpecialistKey } from "@/lib/copilot/team";
import type { RunEvent } from "@/lib/copilot/types";

/** The lesson descriptions of a run at a moment of its replay: each lesson's
 *  text so far, typed one after another, and how many are in. */
export interface LessonsFrame {
  texts: Record<number, { value: string; typing: boolean }>;
  /** Fully typed so far. */
  done: number;
  /** From the step start's data.total. */
  total: number;
  working: { specialist: SpecialistKey; label: string } | null;
  settled: boolean;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

const isDescription = (e: RunEvent) =>
  e.type === "field" &&
  text(e.data.record).startsWith("lesson:") &&
  e.data.name === "content_html";

/** The frame ``elapsedMs`` into the replay, against the same character budget
 *  as ``liveFrame`` (``cps`` characters a second). ``ended``: the run is over,
 *  so it settles without a done step (a stopped or failed run never sends it). */
export function lessonsFrame(
  events: RunEvent[],
  elapsedMs: number,
  cps = 60,
  ended = false,
): LessonsFrame {
  const clock = replayClock(elapsedMs, cps);
  const frame: LessonsFrame = {
    texts: {},
    done: 0,
    total: 0,
    working: null,
    settled: false,
  };
  for (const event of events) {
    if (event.type === "step") {
      clock.step(event.data);
      if (event.data.state !== "done")
        frame.total = Number(event.data.total) || frame.total;
    } else if (isDescription(event)) {
      const full = text(event.data.value);
      const shown = clock.take(full);
      if (shown === null) continue;
      frame.texts[Number(text(event.data.record).slice("lesson:".length))] = {
        value: shown,
        typing: shown.length < full.length,
      };
      if (shown.length === full.length) frame.done += 1;
    }
  }
  Object.assign(frame, clock.settle(ended));
  return frame;
}

/** The live frame of the descriptions run (null without a run). */
export function useLiveLessons(runId: number | null): LessonsFrame | null {
  return useReplay(
    runId,
    "content",
    (events, ms, ended) => lessonsFrame(events, ms, 60, ended),
    (events) => events.some(isDescription),
  );
}
