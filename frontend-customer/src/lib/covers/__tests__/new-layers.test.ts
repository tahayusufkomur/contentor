import { describe, expect, it } from "vitest";
import { applyEdit } from "@/lib/covers/editor";
import {
  newBadgeExtra,
  newShapeExtra,
  newTextExtra,
} from "@/lib/covers/new-layers";
import { defaultRecipe, RANGES } from "@/lib/covers/recipe";
import { SHAPES } from "@/types/design";
import type { Frame } from "@/types/design";

// Card 3:4, 4:5, square and 4:3, Wide, Banner.
const ASPECTS = [3 / 4, 4 / 5, 1, 4 / 3, 16 / 9, 3];

/** What the server keeps: every side inside the ranges, so what she sees is what is saved. */
function expectInRanges(frame: Frame) {
  for (const side of ["x", "y", "w", "h"] as const) {
    const [low, high] = RANGES.frame[side];
    expect(frame[side]).toBeGreaterThanOrEqual(low);
    expect(frame[side]).toBeLessThanOrEqual(high);
  }
}

describe("newTextExtra", () => {
  it("sets a title in the display font, bigger than a subtitle, bigger than a line", () => {
    const recipe = defaultRecipe();
    const title = newTextExtra(recipe, "title", 16 / 9, "Your title");
    const subtitle = newTextExtra(recipe, "subtitle", 16 / 9, "Your subtitle");
    const line = newTextExtra(recipe, "line", 16 / 9, "Your text");
    expect(title).toMatchObject({
      type: "text",
      text: "Your title",
      style: { font: "display" },
    });
    expect(subtitle.style.font).toBe("body");
    expect(line.style.font).toBe("body");
    expect(title.style.scale!).toBeGreaterThan(subtitle.style.scale!);
    expect(subtitle.style.scale!).toBeGreaterThan(line.style.scale!);
  });

  it("takes the first free id", () => {
    const recipe = defaultRecipe();
    const first = newTextExtra(recipe, "line", 1, "a");
    expect(first.id).toBe("x1");
    const next = applyEdit(recipe, { type: "addExtra", extra: first });
    expect(newTextExtra(next, "line", 1, "b").id).toBe("x2");
  });

  it("is a frame the server keeps as it is, in every shape of cover", () => {
    for (const aspect of ASPECTS) {
      for (const kind of ["title", "subtitle", "line"] as const) {
        const extra = newTextExtra(defaultRecipe(), kind, aspect, "x");
        expectInRanges(extra.frame);
        // and on the cover, not past its edge
        expect(extra.frame.x + extra.frame.w).toBeLessThanOrEqual(1);
        expect(extra.frame.y + extra.frame.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("steps down and across for each layer already added, so two do not sit on one another", () => {
    const recipe = defaultRecipe();
    const first = newTextExtra(recipe, "title", 16 / 9, "a");
    const withOne = applyEdit(recipe, { type: "addExtra", extra: first });
    const second = newTextExtra(withOne, "title", 16 / 9, "b");
    expect(second.frame.x).toBeGreaterThan(first.frame.x);
    expect(second.frame.y).toBeGreaterThan(first.frame.y);
  });

  it("is added by the reducer under the id it carries", () => {
    const recipe = defaultRecipe();
    const extra = newTextExtra(recipe, "subtitle", 1, "Hello");
    const next = applyEdit(recipe, { type: "addExtra", extra });
    expect(next.extras).toEqual([extra]);
  });
});

describe("newShapeExtra", () => {
  it("makes each shape in the look's accent, fully opaque", () => {
    for (const shape of SHAPES) {
      expect(newShapeExtra(defaultRecipe(), shape, 16 / 9)).toMatchObject({
        type: "shape",
        shape,
        fill: "accent",
        opacity: 1,
      });
    }
  });

  it("draws a circle round and a line thin, whatever the shape of the cover", () => {
    for (const aspect of ASPECTS) {
      const circle = newShapeExtra(defaultRecipe(), "circle", aspect).frame;
      // in pixels of a canvas `aspect` wide for 1 high
      expect(circle.w * aspect).toBeCloseTo(circle.h, 2);
      const line = newShapeExtra(defaultRecipe(), "line", aspect).frame;
      expect(line.h).toBeLessThanOrEqual(0.04);
      expect(line.w * aspect).toBeGreaterThan(line.h * 5);
    }
  });

  it("is a frame the server keeps as it is, on the cover", () => {
    for (const aspect of ASPECTS) {
      for (const shape of SHAPES) {
        const { frame } = newShapeExtra(defaultRecipe(), shape, aspect);
        expectInRanges(frame);
        expect(frame.x + frame.w).toBeLessThanOrEqual(1);
        expect(frame.y + frame.h).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("newBadgeExtra", () => {
  it("is a badge of her words, in the accent, at the top right where the fixed badge sits", () => {
    for (const aspect of ASPECTS) {
      const badge = newBadgeExtra(defaultRecipe(), aspect, "Your words");
      expect(badge).toMatchObject({
        type: "badge",
        text: "Your words",
        fill: "accent",
      });
      expectInRanges(badge.frame);
      expect(badge.frame.x + badge.frame.w).toBeGreaterThan(0.8);
      expect(badge.frame.y).toBeLessThan(0.15);
    }
  });
});
