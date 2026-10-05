import { describe, expect, it } from "vitest";
import {
  formatPrice,
  joinSpeech,
  landedPage,
  noteEntry,
  pastEntries,
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

describe("pastEntries", () => {
  const q = (question: string) => ({
    role: "guide" as const,
    ack: "",
    question,
    options: [],
    field: "x",
    can_delegate: true,
  });
  it("hides the live question even when a note follows it", () => {
    const entries = [
      q("old"),
      { role: "coach" as const, text: "a" },
      q("live"),
      noteEntry("Done"),
    ];
    expect(
      pastEntries(entries, false).map((e) =>
        e.role === "guide" ? e.question || e.ack : e.text,
      ),
    ).toEqual(["old", "a", "Done"]);
  });
  it("keeps everything while a turn is in flight", () => {
    expect(pastEntries([q("live")], true)).toHaveLength(1);
  });
});
