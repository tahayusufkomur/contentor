import { describe, expect, it } from "vitest";
import type { FocusQuestion } from "@/lib/focus/api";
import { guideBody } from "@/lib/focus/guide";

const q = (field: string): FocusQuestion => ({
  field,
  kind: "choice",
  question: "?",
  why: "",
  options: [],
  starter: null,
  can_delegate: true,
  specialist: "content",
});

const none = { picked: null, text: "", delegate: false, rest: false };

describe("guideBody", () => {
  it("sends a tile as its value", () => {
    expect(guideBody(q("level"), { ...none, picked: "beginners" })).toEqual({
      field: "level",
      value: "beginners",
    });
  });

  it("sends her words as text", () => {
    expect(
      guideBody(q("topic"), { ...none, text: " A course on desk yoga " }),
    ).toEqual({ field: "topic", text: "A course on desk yoga" });
  });

  it("sends You decide and Just draft it", () => {
    expect(guideBody(q("size"), { ...none, delegate: true })).toEqual({
      field: "size",
      delegate: true,
    });
    expect(guideBody(q("level"), { ...none, rest: true })).toEqual({
      field: "level",
      rest: true,
    });
  });

  it("sends nothing when nothing is picked or typed", () => {
    expect(guideBody(q("level"), none)).toBeNull();
    expect(guideBody(q("level"), { ...none, text: "   " })).toBeNull();
  });
});
