import { describe, expect, it } from "vitest";
import { defaultRecipe } from "@/lib/covers/recipe";
import { targetAction, targetState } from "@/lib/covers/targets";
import type { CoverDesign, DesignTarget } from "@/types/design";

const target = (over: Partial<DesignTarget> = {}): DesignTarget => ({
  target_kind: "course",
  target_key: "7",
  title: "Yoga for Beginners",
  sessions: null,
  next_at: null,
  status: "published",
  photo_url: null,
  cover: null,
  draft_id: null,
  ...over,
});

const kept: CoverDesign = {
  id: "kept-1",
  recipe: defaultRecipe(),
  photos: {},
  logo_url: null,
  look: "journal",
};

describe("targetState", () => {
  it("is none for a target with no picture and no design", () => {
    expect(targetState(target())).toBe("none");
  });

  it("is photo when it wears only a plain photo", () => {
    expect(targetState(target({ photo_url: "https://x/p.jpg" }))).toBe("photo");
  });

  it("is designed when it wears a kept cover, photo link or not", () => {
    expect(targetState(target({ cover: kept }))).toBe("designed");
    expect(
      targetState(target({ cover: kept, photo_url: "https://x/p.jpg" })),
    ).toBe("designed");
  });

  it("is draft whenever a draft waits, whatever it wears now", () => {
    expect(targetState(target({ draft_id: "d-1" }))).toBe("draft");
    expect(
      targetState(
        target({ draft_id: "d-1", cover: kept, photo_url: "https://x/p.jpg" }),
      ),
    ).toBe("draft");
  });
});

describe("targetAction", () => {
  it("starts a cover for a target with none or a plain photo", () => {
    expect(targetAction(target())).toEqual({ key: "design" });
    expect(targetAction(target({ photo_url: "https://x/p.jpg" }))).toEqual({
      key: "design",
    });
  });

  it("copies the kept design it wears", () => {
    expect(targetAction(target({ cover: kept }))).toEqual({
      key: "editCopy",
      from: "kept-1",
    });
  });

  it("goes back to a draft that waits, and copies nothing", () => {
    expect(targetAction(target({ draft_id: "d-1", cover: kept }))).toEqual({
      key: "continue",
    });
  });
});
