// A class or event in focus mode: she and the copy run both write its title and
// description. A replayed frame never replaces what she changed, saved or not,
// and the field she owns is never shown as "being written".

import { describe, expect, it } from "vitest";

import { eventOwn } from "@/lib/focus/own-fields";

const { isHers, isWriting, layOver } = eventOwn;

// What the form was last given: the saved copy, or a value the replay typed in.
const placed = { title: "Intro", description: "A first class" };

describe("a replayed frame of the copy run", () => {
  it("never replaces a title she changed and saved", () => {
    // She retitled it and saved: the server and the form both hold "My yoga",
    // yet the form was last *given* "Intro". The replay now reaches the run's
    // title, which the server did not keep.
    const mine = { title: "My yoga", description: "A first class" };
    const { form, placed: after } = layOver(mine, placed, {
      ...placed,
      title: "Morning flow",
    });
    expect(form.title).toBe("My yoga");
    expect(after.title).toBe("Intro");
  });

  it("still types in the field she has not touched", () => {
    const mine = { title: "My yoga", description: "A first class" };
    const { form, placed: after } = layOver(mine, placed, {
      ...placed,
      description: "Slow and kind",
    });
    expect(form).toEqual({ title: "My yoga", description: "Slow and kind" });
    expect(after.description).toBe("Slow and kind");
  });

  it("does not count a trailing space in the title as hers", () => {
    expect(isHers("title", "Intro  ", "Intro")).toBe(false);
    expect(isHers("description", "A first class ", "A first class")).toBe(true);
  });
});

describe("the field the run is typing", () => {
  it("is read-only only while it is not hers", () => {
    expect(isWriting("title", true, "Intro", "Intro")).toBe(true);
    // She changed it (and saved, so the server has hers): her keys must land.
    expect(isWriting("title", true, "My yoga", "Intro")).toBe(false);
    expect(isWriting("description", true, "Mine", "")).toBe(false);
    // Nothing being typed: never locked.
    expect(isWriting("title", false, "Intro", "Intro")).toBe(false);
  });
});
