"use client";

import { useReplay } from "@/lib/copilot/live";
import { asSpecialist, type SpecialistKey } from "@/lib/copilot/team";
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
 *  as ``liveFrame`` (``cps`` characters a second). */
export function lessonsFrame(
  events: RunEvent[],
  elapsedMs: number,
  cps = 60,
): LessonsFrame {
  let budget =
    elapsedMs === Infinity ? Infinity : Math.floor((elapsedMs * cps) / 1000);
  const frame: LessonsFrame = {
    texts: {},
    done: 0,
    total: 0,
    working: null,
    settled: false,
  };
  let started: LessonsFrame["working"] = null;
  let stepDone = false;
  let complete = true;
  for (const event of events) {
    if (event.type === "step") {
      if (event.data.state === "done") stepDone = true;
      else {
        started = {
          specialist: asSpecialist(event.data.specialist),
          label: text(event.data.label),
        };
        frame.total = Number(event.data.total) || frame.total;
        stepDone = false;
      }
    } else if (isDescription(event) && complete) {
      const full = text(event.data.value);
      const shown = full.slice(0, Math.max(0, Math.min(full.length, budget)));
      budget -= full.length;
      complete = shown.length === full.length;
      frame.texts[Number(text(event.data.record).slice("lesson:".length))] = {
        value: shown,
        typing: !complete,
      };
      if (complete) frame.done += 1;
    }
  }
  frame.settled = complete && stepDone;
  frame.working = started && !frame.settled ? started : null;
  return frame;
}

/** The live frame of the descriptions run (null without a run). */
export function useLiveLessons(runId: number | null): LessonsFrame | null {
  return useReplay(runId, "content", lessonsFrame, (events) =>
    events.some(isDescription),
  );
}
