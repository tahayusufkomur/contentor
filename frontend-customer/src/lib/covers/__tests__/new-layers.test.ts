import { describe, expect, it } from "vitest";
import { applyEdit, editHistory } from "@/lib/covers/editor";
import {
  newBadgeExtra,
  newShapeExtra,
  newTextExtra,
  type NewLayer,
} from "@/lib/covers/new-layers";
import {
  defaultRecipe,
  framesFor,
  RANGES,
  sizeAspect,
} from "@/lib/covers/recipe";
import { createHistory, undo } from "@/lib/logo/history";
import { SHAPES, SIZES } from "@/types/design";
import type { CoverRecipe, CoverSize, Frame } from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";

// Every shape of Card a look has; Wide is 16/9 and Banner 3/1 whatever it is.
const CARDS: CoverAspect[] = ["3/4", "4/5", "1/1", "4/3", "3/2", "16/10"];

type Make = (recipe: CoverRecipe, card: CoverAspect) => NewLayer;
/** Every kind of layer the drawers add. */
const KINDS: [name: string, make: Make][] = [
  ["a title", (r, c) => newTextExtra(r, "title", c, "Your title")],
  ["a subtitle", (r, c) => newTextExtra(r, "subtitle", c, "Your subtitle")],
  ["a line of text", (r, c) => newTextExtra(r, "line", c, "Your text")],
  ["a badge", (r, c) => newBadgeExtra(r, c, "Your words")],
  ...SHAPES.map((shape): [string, Make] => [
    `the ${shape} shape`,
    (r, c) => newShapeExtra(r, shape, c),
  ]),
];

/** A cover with `n` lines of text on it already (the next layer steps away from them). */
function withLines(n: number, card: CoverAspect): CoverRecipe {
  let recipe = defaultRecipe();
  for (let i = 0; i < n; i++) {
    recipe = applyEdit(recipe, {
      type: "addExtra",
      ...newTextExtra(recipe, "line", card, `Line ${i}`),
    });
  }
  return recipe;
}

/** The layer added by the edit the drawers make, and the frame it is drawn with at each size. */
function addedTo(recipe: CoverRecipe, layer: NewLayer, card: CoverAspect) {
  const after = applyEdit(recipe, { type: "addExtra", ...layer });
  return {
    after,
    at: Object.fromEntries(
      SIZES.map((size) => [size, framesFor(after, size, card)[layer.extra.id]]),
    ) as Record<CoverSize, Frame>,
  };
}

/** A frame's size in cqmin (1% of its canvas's shorter side), the unit layers are sized in. */
const inCqmin = (frame: Frame, aspect: number) => ({
  w: frame.w * 100 * Math.max(1, aspect),
  h: (frame.h * 100) / Math.min(1, aspect),
});

/** What the server keeps: every side inside the ranges, so what she sees is what is saved. */
function expectInRanges(frame: Frame) {
  for (const side of ["x", "y", "w", "h"] as const) {
    const [low, high] = RANGES.frame[side];
    expect(frame[side]).toBeGreaterThanOrEqual(low);
    expect(frame[side]).toBeLessThanOrEqual(high);
  }
}

describe("every kind of new layer, at all three sizes", () => {
  for (const [name, make] of KINDS) {
    it(`${name} is drawn at Card, Wide and Banner, inside each canvas and the server's ranges`, () => {
      for (const card of CARDS) {
        for (const existing of [0, 4]) {
          const recipe = withLines(existing, card);
          const { at } = addedTo(recipe, make(recipe, card), card);
          for (const size of SIZES) {
            const frame = at[size];
            expect(frame, `${size} on a ${card} card`).toBeDefined();
            expectInRanges(frame);
            expect(frame.x).toBeGreaterThanOrEqual(0);
            expect(frame.y).toBeGreaterThanOrEqual(0);
            expect(frame.x + frame.w).toBeLessThanOrEqual(1);
            expect(frame.y + frame.h).toBeLessThanOrEqual(1);
          }
        }
      }
    });

    it(`${name} keeps its shape: the same size in cqmin at every size`, () => {
      for (const card of CARDS) {
        const recipe = defaultRecipe();
        const { at } = addedTo(recipe, make(recipe, card), card);
        const onCard = inCqmin(at.card, sizeAspect("card", card));
        for (const size of SIZES) {
          const box = inCqmin(at[size], sizeAspect(size, card));
          expect(box.w, `${size} width on a ${card} card`).toBeCloseTo(
            onCard.w,
            1,
          );
          expect(box.h, `${size} height on a ${card} card`).toBeCloseTo(
            onCard.h,
            1,
          );
        }
      }
    });
  }

  it("a circle is round and a line is thin, wherever it was added", () => {
    for (const card of CARDS) {
      const recipe = defaultRecipe();
      const circle = addedTo(
        recipe,
        newShapeExtra(recipe, "circle", card),
        card,
      );
      const line = addedTo(recipe, newShapeExtra(recipe, "line", card), card);
      for (const size of SIZES) {
        const aspect = sizeAspect(size, card);
        // as wide as high in pixels of a canvas `aspect` wide for 1 high
        expect(circle.at[size].w * aspect).toBeCloseTo(circle.at[size].h, 2);
        // as thin as the one on Card (a frame's least height is a clamp on a tall Card), and long
        const { w, h } = inCqmin(line.at[size], aspect);
        expect(h).toBeCloseTo(
          inCqmin(line.at.card, sizeAspect("card", card)).h,
          1,
        );
        expect(h).toBeLessThanOrEqual(3);
        expect(w).toBeGreaterThan(h * 10);
      }
    }
  });

  it("shapes sit at the same place on every canvas, text at its share of the height, a badge in the corner", () => {
    for (const card of CARDS) {
      const recipe = defaultRecipe();
      for (const shape of SHAPES) {
        const { at } = addedTo(
          recipe,
          newShapeExtra(recipe, shape, card),
          card,
        );
        for (const size of SIZES) {
          expect(at[size].x + at[size].w / 2).toBeCloseTo(0.62, 3);
          expect(at[size].y + at[size].h / 2).toBeCloseTo(0.38, 3);
        }
      }
      const title = addedTo(
        recipe,
        newTextExtra(recipe, "title", card, "T"),
        card,
      );
      const badge = addedTo(recipe, newBadgeExtra(recipe, card, "B"), card);
      for (const size of SIZES) {
        const aspect = sizeAspect(size, card);
        const width = 100 * Math.max(1, aspect);
        const height = 100 / Math.min(1, aspect);
        // the left margin the layouts keep, whatever the width
        expect(title.at[size].x * width).toBeCloseTo(5.5, 1);
        expect(title.at[size].y).toBeCloseTo(0.3, 3);
        // the corner where the fixed badge sits
        expect((1 - badge.at[size].x - badge.at[size].w) * width).toBeCloseTo(
          5.5,
          1,
        );
        expect(badge.at[size].y * height).toBeCloseTo(5.5, 1);
      }
    }
  });

  it("gives Card the extra's own frame and Wide and Banner theirs, nothing else", () => {
    const recipe = defaultRecipe();
    const layer = newShapeExtra(recipe, "circle", "4/5");
    expect(Object.keys(layer.frames).sort()).toEqual(["banner", "wide"]);
    const { after } = addedTo(recipe, layer, "4/5");
    expect(after.extras).toEqual([layer.extra]);
    expect(after.overrides).toEqual({
      wide: { [layer.extra.id]: layer.frames.wide },
      banner: { [layer.extra.id]: layer.frames.banner },
    });
  });

  it("is one history step: one Undo takes the layer from all three sizes", () => {
    const start = defaultRecipe();
    const layer = newShapeExtra(start, "circle", "4/5");
    const history = editHistory(createHistory(start), {
      type: "addExtra",
      ...layer,
    });
    expect(history.past).toHaveLength(1);
    for (const size of SIZES) {
      expect(framesFor(history.present, size, "4/5")[layer.extra.id]).toEqual(
        size === "card" ? layer.extra.frame : layer.frames[size],
      );
    }
    const back = undo(history);
    expect(back.present).toBe(start);
    for (const size of SIZES) {
      expect(framesFor(back.present, size, "4/5")[layer.extra.id]).toBe(
        undefined,
      );
    }
  });
});

describe("newTextExtra", () => {
  it("sets a title in the display font, bigger than a subtitle, bigger than a line", () => {
    const recipe = defaultRecipe();
    const title = newTextExtra(recipe, "title", "4/5", "Your title").extra;
    const subtitle = newTextExtra(
      recipe,
      "subtitle",
      "4/5",
      "Your subtitle",
    ).extra;
    const line = newTextExtra(recipe, "line", "4/5", "Your text").extra;
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
    const first = newTextExtra(recipe, "line", "1/1", "a");
    expect(first.extra.id).toBe("x1");
    const next = applyEdit(recipe, { type: "addExtra", ...first });
    expect(newTextExtra(next, "line", "1/1", "b").extra.id).toBe("x2");
  });

  it("steps down and across for each layer already added, so two do not sit on one another", () => {
    const recipe = defaultRecipe();
    const first = newTextExtra(recipe, "title", "4/5", "a");
    const withOne = applyEdit(recipe, { type: "addExtra", ...first });
    const second = newTextExtra(withOne, "title", "4/5", "b");
    expect(second.extra.frame.x).toBeGreaterThan(first.extra.frame.x);
    expect(second.extra.frame.y).toBeGreaterThan(first.extra.frame.y);
    // and so at the other sizes
    expect(second.frames.wide!.x).toBeGreaterThan(first.frames.wide!.x);
    expect(second.frames.banner!.y).toBeGreaterThan(first.frames.banner!.y);
  });
});

describe("newShapeExtra", () => {
  it("makes each shape in the look's accent, fully opaque", () => {
    for (const shape of SHAPES) {
      expect(newShapeExtra(defaultRecipe(), shape, "4/5").extra).toMatchObject({
        type: "shape",
        shape,
        fill: "accent",
        opacity: 1,
      });
    }
  });
});

describe("newBadgeExtra", () => {
  it("is a badge of her words, in the accent", () => {
    expect(
      newBadgeExtra(defaultRecipe(), "4/5", "Your words").extra,
    ).toMatchObject({ type: "badge", text: "Your words", fill: "accent" });
  });
});
