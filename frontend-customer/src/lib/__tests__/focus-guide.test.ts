import { describe, expect, it } from "vitest";
import type { FocusQuestion } from "@/lib/focus/api";
import { guideBody, pickAnswer } from "@/lib/focus/guide";

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

  it("sends Just draft it with what she typed in the box", () => {
    expect(
      guideBody(q("level"), { ...none, rest: true, text: " nurses " }),
    ).toEqual({ field: "level", rest: true, text: "nurses" });
  });

  it("sends nothing when nothing is picked or typed", () => {
    expect(guideBody(q("level"), none)).toBeNull();
    expect(guideBody(q("level"), { ...none, text: "   " })).toBeNull();
  });
});

describe("pickAnswer", () => {
  const tiles = ["course:1", "course:2", "download:3"];

  it("sends her ticks as one answer, in tile order", () => {
    expect(pickAnswer(tiles, ["download:3", "course:1"], "all")).toBe(
      "course:1,download:3",
    );
  });

  it("sends every tile as all", () => {
    expect(pickAnswer(tiles, [...tiles].reverse(), "all")).toBe("all");
  });

  it("drops a tick that is no longer a tile, and sends nothing for none", () => {
    expect(pickAnswer(tiles, ["course:2", "course:9"], "all")).toBe("course:2");
    expect(pickAnswer(tiles, [], "all")).toBe("");
  });
});
