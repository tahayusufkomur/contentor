import { describe, expect, it } from "vitest";
import { ownPicked, prefilledPicks, type QuestionStep } from "@/lib/interview";

const step = (over: Partial<QuestionStep>): QuestionStep =>
  ({
    ack: "",
    question: "Which kinds do you teach?",
    options: ["Salsa", "Salsa shine", "Bachata"],
    field: "specialty",
    can_delegate: false,
    multi: true,
    custom: true,
    ...over,
  }) as QuestionStep;

describe("ownPicked", () => {
  it("reads back only the labels that are none of the options", () => {
    expect(ownPicked(step({ answer: "Salsa, Dancehall" }))).toEqual([
      "Dancehall",
    ]);
    // A whole-label match: "Salsa" never cuts "Salsa shine".
    expect(ownPicked(step({ answer: "Salsa shine, Kizomba" }))).toEqual([
      "Kizomba",
    ]);
    expect(ownPicked(step({ answer: "Salsa, Salsa shine" }))).toEqual([]);
  });

  it("is empty without a custom question or an answer", () => {
    expect(ownPicked(step({ answer: "Dancehall", custom: false }))).toEqual([]);
    expect(ownPicked(step({ answer: undefined }))).toEqual([]);
  });

  it("reads nothing back from a starter: its answer is a sentence", () => {
    expect(
      ownPicked(
        step({
          options: ["I found yoga when…"],
          starter: true,
          answer: "I found yoga when my back gave out, and I trained",
        }),
      ),
    ).toEqual([]);
  });

  it("ignores a note sent on the lines after the picks", () => {
    expect(ownPicked(step({ answer: "Dancehall\nI love it" }))).toEqual([
      "Dancehall",
    ]);
  });
});

describe("prefilledPicks", () => {
  it("ticks the tiles it names and adds the rest as her own", () => {
    expect(
      prefilledPicks(step({ prefill_options: ["bachata", "Kizomba"] })),
    ).toEqual({ tiles: ["Bachata"], own: ["Kizomba"] });
  });

  it("keeps only the tiles where she cannot add her own", () => {
    expect(
      prefilledPicks(
        step({ custom: false, prefill_options: ["Salsa", "Kizomba"] }),
      ),
    ).toEqual({ tiles: ["Salsa"], own: [] });
  });

  it("does nothing once the question is answered", () => {
    expect(
      prefilledPicks(step({ answer: "Salsa", prefill_options: ["Bachata"] })),
    ).toEqual({ tiles: [], own: [] });
  });
});
