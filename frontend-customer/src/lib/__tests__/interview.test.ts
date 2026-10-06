import { describe, expect, it } from "vitest";
import type { InterviewEntry } from "@/lib/setup-flow";
import {
  activityLine,
  finishedNotes,
  formatPrice,
  joinSpeech,
  landedPage,
  noteEntry,
  splitEntries,
  stageIndex,
  toEntry,
} from "@/lib/interview";

describe("joinSpeech", () => {
  it("starts from an empty box", () => {
    expect(joinSpeech("", " hello there ")).toBe("hello there");
  });
  it("appends with one space", () => {
    expect(joinSpeech("I teach yoga ", "to office workers")).toBe(
      "I teach yoga to office workers",
    );
  });
  it("ignores an empty phrase", () => {
    expect(joinSpeech("keep me", "  ")).toBe("keep me");
  });
});

describe("landedPage", () => {
  it("finds the page that just turned ready", () => {
    expect(
      landedPage(
        { home: { status: "building" }, about: { status: "idle" } },
        { home: { status: "ready" }, about: { status: "building" } },
      ),
    ).toBe("home");
  });
  it("is null when nothing changed", () => {
    expect(
      landedPage({ home: { status: "ready" } }, { home: { status: "ready" } }),
    ).toBeNull();
  });
});

describe("toEntry / noteEntry", () => {
  it("drops the cards from a stored guide turn", () => {
    const entry = toEntry({
      ack: "a",
      question: "q",
      options: [],
      field: "teaches",
      can_delegate: true,
      cards: { kind: "style", options: [] },
    });
    expect(entry).toEqual({
      role: "guide",
      ack: "a",
      question: "q",
      options: [],
      field: "teaches",
      can_delegate: true,
    });
  });
  it("makes a note with an undo handle", () => {
    expect(noteEntry("Done", 7)).toMatchObject({
      role: "guide",
      ack: "Done",
      audit_id: 7,
      field: null,
    });
  });
});

describe("formatPrice", () => {
  it("formats cents in the plan currency", () => {
    expect(formatPrice(1990, "usd")).toBe("$19.90");
    expect(formatPrice(null, "eur")).toBe("");
  });
});

describe("splitEntries", () => {
  const q = (question: string) => ({
    role: "guide" as const,
    ack: "",
    question,
    options: [],
    field: "x",
    can_delegate: true,
  });
  const text = (e: InterviewEntry) =>
    e.role === "guide" ? e.question || e.ack : e.text;
  it("splits around the live question, keeping notes after it in order", () => {
    const entries = [
      q("old"),
      { role: "coach" as const, text: "a" },
      q("live"),
      noteEntry("Done"),
    ];
    const { past, after } = splitEntries(entries, false);
    expect(past.map(text)).toEqual(["old", "a"]);
    expect(after.map(text)).toEqual(["Done"]);
  });
  it("keeps everything in the past while a turn is in flight", () => {
    expect(splitEntries([q("live")], true)).toEqual({
      past: [q("live")],
      after: [],
    });
  });
});

describe("activityLine", () => {
  it("is null when nothing is building", () => {
    expect(activityLine({ home: { status: "ready" } }, {})).toBeNull();
  });
  it("names the page and its stage", () => {
    expect(activityLine({ about: { status: "building" } }, {})).toBe(
      "Building your About page: planning the layout",
    );
    expect(
      activityLine({ home: { status: "building", stage: "photos" } }, {}),
    ).toBe("Building your home page: picking photos");
    expect(stageIndex("copy")).toBe(1);
  });
  it("counts what else is on the way", () => {
    expect(
      activityLine(
        { home: { status: "building", stage: "copy" } },
        { course: "building", post: "ready" },
      ),
    ).toBe("Building your home page: writing the words · 1 more on the way");
    expect(activityLine({}, { course: "building" })).toBe(
      "Drafting your first course",
    );
  });
});

describe("finishedNotes", () => {
  const builds = (home: string, about = "idle") => ({
    home: { status: home },
    about: { status: about },
  });
  it("announces pages and drafts that just finished", () => {
    expect(
      finishedNotes(
        {
          builds: builds("building", "building"),
          drafts: { course: "building" },
        },
        { builds: builds("ready", "failed"), drafts: { course: "ready" } },
      ),
    ).toEqual([
      "Your home page is ready. Have a look, and tell me anything you’d like changed.",
      "I couldn’t finish your About page, so it keeps its first version for now.",
      "Your first course is drafted. I’m adding it to your Courses page.",
    ]);
  });
  it("says nothing when nothing changed", () => {
    const same = { builds: builds("ready"), drafts: { course: "ready" } };
    expect(finishedNotes(same, same)).toEqual([]);
  });
});
