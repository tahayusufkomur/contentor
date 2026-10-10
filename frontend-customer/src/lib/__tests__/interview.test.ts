import { describe, expect, it } from "vitest";
import type { GuideTurn, InterviewEntry } from "@/lib/setup-flow";
import {
  activityLine,
  finishedNotes,
  formatPrice,
  joinSpeech,
  landedPage,
  noteOf,
  pickedOptions,
  questionSteps,
  stageIndex,
  withNote,
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

describe("formatPrice", () => {
  it("formats cents in the plan currency", () => {
    expect(formatPrice(1990, "usd")).toBe("$19.90");
    expect(formatPrice(null, "eur")).toBe("");
  });
});

describe("questionSteps", () => {
  const ask = (field: string, question = `${field}?`): GuideTurn => ({
    ack: "",
    question,
    options: ["A", "B"],
    field,
    can_delegate: true,
  });
  const guide = (field: string, question?: string): InterviewEntry => ({
    role: "guide",
    ...ask(field, question),
  });
  const said = (text: string, field?: string): InterviewEntry => ({
    role: "coach",
    text,
    ...(field ? { field } : {}),
  });

  it("keeps icons and hints on a question", () => {
    const g: GuideTurn = {
      ...ask("tone"),
      icons: { A: "heart" },
      hints: { A: "Come as you are." },
    };
    const steps = questionSteps([{ role: "guide", ...g }], g);
    expect(steps[0].icons).toEqual({ A: "heart" });
    expect(steps[0].hints).toEqual({ A: "Come as you are." });
  });

  it("keeps icons and hints on an answered question too", () => {
    const g: GuideTurn = {
      ...ask("tone"),
      icons: { A: "heart" },
      hints: { A: "Come as you are." },
    };
    const steps = questionSteps(
      [{ role: "guide", ...g }, said("A")],
      ask("next"),
    );
    expect(steps[0].icons).toEqual({ A: "heart" });
    expect(steps[0].hints).toEqual({ A: "Come as you are." });
  });

  it("lists answered questions in order, then the live one", () => {
    const entries = [
      guide("teaches"),
      said("Yoga"),
      guide("audience"),
      said("Parents"),
      guide("outcome"),
    ];
    const steps = questionSteps(entries, ask("outcome"));
    expect(steps.map((s) => [s.field, s.answer])).toEqual([
      ["teaches", "Yoga"],
      ["audience", "Parents"],
      ["outcome", undefined],
    ]);
  });
  it("keeps a revisited question in place with its new answer", () => {
    const entries = [
      guide("teaches"),
      said("Yoga"),
      guide("audience", "Who?"),
      said("Parents"),
      guide("outcome"),
      said("Pilates", "teaches"),
      guide("outcome", "What changes?"),
    ];
    const steps = questionSteps(entries, ask("outcome", "What changes?"));
    expect(steps.map((s) => [s.field, s.answer])).toEqual([
      ["teaches", "Pilates"],
      ["audience", "Parents"],
      ["outcome", undefined],
    ]);
    expect(steps[2].question).toBe("What changes?");
  });
  it("has no live step once nothing is left to ask", () => {
    const done: GuideTurn = { ...ask("x"), field: null, question: "Ready" };
    expect(questionSteps([guide("teaches"), said("Yoga")], done)).toHaveLength(
      1,
    );
  });
});

describe("pickedOptions", () => {
  const step = {
    ...{ ack: "", question: "q", field: "f", can_delegate: true },
  };
  it("finds every option a multi answer named", () => {
    expect(
      pickedOptions({
        ...step,
        multi: true,
        options: ["Parents", "Busy professionals", "Seniors"],
        answer: "parents, Busy professionals",
      }),
    ).toEqual(["Parents", "Busy professionals"]);
  });
  it("keeps options that contain commas whole", () => {
    expect(
      pickedOptions({
        ...step,
        multi: true,
        options: ["No mirrors, no judgement", "Small classes", "Costumes"],
        answer: "No mirrors, no judgement, Small classes",
      }),
    ).toEqual(["No mirrors, no judgement", "Small classes"]);
  });
  it("matches a single answer whole, and typed text not at all", () => {
    expect(
      pickedOptions({ ...step, options: ["Yoga"], answer: "Yoga" }),
    ).toEqual(["Yoga"]);
    expect(
      pickedOptions({ ...step, options: ["Yoga"], answer: "Yoga, mostly" }),
    ).toEqual([]);
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

describe("answers sent with a note", () => {
  const step: GuideTurn = {
    ack: "",
    question: "Who do you teach?",
    field: "audience",
    can_delegate: false,
    multi: true,
    options: ["Desk workers needing relief", "Runners"],
  };
  it("puts the note on its own line after the picks", () => {
    expect(
      withNote("Desk workers needing relief", "  mostly women over 40 "),
    ).toBe("Desk workers needing relief\nmostly women over 40");
    expect(withNote("", "just a note")).toBe("just a note");
    expect(withNote("Runners", "")).toBe("Runners");
  });
  it("going back ticks the tiles and puts the note back in the box", () => {
    const answer = withNote(
      "Desk workers needing relief",
      "mostly women over 40",
    );
    expect(pickedOptions({ ...step, answer })).toEqual([
      "Desk workers needing relief",
    ]);
    expect(noteOf(answer)).toBe("mostly women over 40");
    expect(noteOf("Runners")).toBe("");
  });
});
