import { describe, expect, it } from "vitest";
import { ownPicked, type QuestionStep } from "@/lib/interview";

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
