import { describe, expect, it } from "vitest";
import {
  applyEdit,
  canRemove,
  coalesceKey,
  editHistory,
  newExtraId,
  type EditorAction,
  type ExtraPatch,
} from "@/lib/covers/editor";
import { defaultRecipe } from "@/lib/covers/recipe";
import {
  createHistory,
  push,
  redo,
  undo,
  type EditHistory,
} from "@/lib/logo/history";
import { MAX_EXTRAS, PARTS } from "@/types/design";
import type {
  CoverRecipe,
  Extra,
  Frame,
  PartId,
  PartStyle,
} from "@/types/design";

const PHOTO_A = "0b0f1c52-5a35-4a6e-9a3a-0c8a1f6d6a01";
const PHOTO_B = "0b0f1c52-5a35-4a6e-9a3a-0c8a1f6d6a02";
const VALID_ID = /^[a-z0-9-]{1,24}$/;

/** Every recipe the tests edit is frozen: a reducer that writes to its input throws. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
  }
  return value;
}
const recipeWith = (patch: Partial<CoverRecipe> = {}): CoverRecipe =>
  deepFreeze({ ...defaultRecipe(), ...patch });
const frame = (x: number, y: number, w = 0.2, h = 0.1): Frame => ({
  x,
  y,
  w,
  h,
});
const text = (id: string, at = frame(0.1, 0.1)): Extra => ({
  id,
  type: "text",
  text: `Text ${id}`,
  style: {},
  frame: at,
});
const shape = (id: string): Extra => ({
  id,
  type: "shape",
  shape: "circle",
  fill: "accent",
  opacity: 1,
  frame: frame(0.5, 0.5),
});
const ids = (recipe: CoverRecipe) => recipe.extras.map((extra) => extra.id);
/** What a caller without TypeScript could send. */
const untyped = (value: unknown) => value as never;

describe("layout and applySet", () => {
  it("changes only the layout: her words, photo, colours and extras stay", () => {
    const before = recipeWith({
      words: { label: "Spring", title: "Yoga basics", subtitle: "Six weeks" },
      photo: { ...defaultRecipe().photo, id: PHOTO_A, zoom: 1.4 },
      panel: "#1E5AA8",
      styles: { title: { scale: 1.2 } },
      extras: [text("x1")],
    });
    const after = applyEdit(before, { type: "layout", layout: "full" });
    expect(after.layout).toBe("full");
    expect({ ...after, layout: before.layout }).toEqual(before);
  });

  it("drops the per-size frames of fixed parts (positions in the old layout) and keeps the extras'", () => {
    const before = recipeWith({
      extras: [text("x1")],
      overrides: {
        card: { title: frame(0.1, 0.1), x1: frame(0.3, 0.3) },
        banner: { logo: frame(0.8, 0.1) },
        wide: { x1: frame(0.4, 0.4) },
      },
    });
    const after = applyEdit(before, { type: "layout", layout: "title" });
    // banner held only a fixed part's frame: no empty size is left behind
    expect(after.overrides).toEqual({
      card: { x1: frame(0.3, 0.3) },
      wide: { x1: frame(0.4, 0.4) },
    });
  });

  it("applySet takes the set's layout, colours, styles, badge and logo, and keeps this item's words, photo and extras", () => {
    const kept = recipeWith({
      layout: "band",
      panel: "accent-dark",
      styles: { title: { scale: 1.3, font: "display" } },
      badge: { kind: "new", text: "", fill: "accent" },
      logo: false,
      words: { label: "Kept", title: "Kept title", subtitle: "Kept sub" },
      photo: { ...defaultRecipe().photo, id: PHOTO_B },
      extras: [text("k1")],
    });
    const before = recipeWith({
      words: { label: "", title: null, subtitle: "" },
      photo: { ...defaultRecipe().photo, id: PHOTO_A },
      extras: [text("x1")],
      overrides: {
        card: { title: frame(0.1, 0.1), x1: frame(0.3, 0.3) },
      },
    });
    const after = applyEdit(before, { type: "applySet", set: kept });
    expect(after).toMatchObject({
      layout: "band",
      panel: "accent-dark",
      styles: { title: { scale: 1.3, font: "display" } },
      badge: { kind: "new" },
      logo: false,
    });
    expect(after.words).toEqual(before.words);
    expect(after.photo).toEqual(before.photo);
    expect(after.extras).toEqual(before.extras);
    expect(after.overrides).toEqual({ card: { x1: frame(0.3, 0.3) } });
    // a copy: editing this cover never reaches the kept one
    expect(after.styles).not.toBe(kept.styles);
    expect(after.styles.title).not.toBe(kept.styles.title);
  });
});

describe("words", () => {
  const start = () =>
    recipeWith({ words: { label: "L", title: "Own title", subtitle: "S" } });

  it("changes the fields it names and keeps the rest", () => {
    const after = applyEdit(start(), {
      type: "words",
      patch: { subtitle: "Six weeks" },
    });
    expect(after.words).toEqual({
      label: "L",
      title: "Own title",
      subtitle: "Six weeks",
    });
  });

  it("stores a blank or whitespace-only title as null: the title follows the item", () => {
    for (const blank of ["", " ", "  \n\t "]) {
      const after = applyEdit(start(), {
        type: "words",
        patch: { title: blank },
      });
      expect(after.words.title).toBeNull();
    }
  });

  it("keeps text as typed, a space at the end of a word included", () => {
    const after = applyEdit(start(), {
      type: "words",
      patch: { title: "Hello " },
    });
    expect(after.words.title).toBe("Hello ");
  });

  it("sets a title back to null on request", () => {
    const after = applyEdit(start(), { type: "words", patch: { title: null } });
    expect(after.words.title).toBeNull();
  });

  it("leaves a field alone when the patch sets it to undefined", () => {
    const after = applyEdit(start(), {
      type: "words",
      patch: { label: "New", title: undefined },
    });
    expect(after.words).toEqual({
      label: "New",
      title: "Own title",
      subtitle: "S",
    });
  });
});

describe("photo, badge, panel and logo", () => {
  const adjusted = recipeWith({
    photo: {
      id: PHOTO_A,
      focus: [0.2, 0.8],
      zoom: 2,
      brightness: 1.2,
      contrast: 0.9,
      saturation: 1.1,
      darken: 0.3,
    },
  });

  it("a new photo resets the focus and zoom (its subject sits elsewhere) and keeps the adjustments", () => {
    const after = applyEdit(adjusted, { type: "photo", id: PHOTO_B });
    expect(after.photo).toEqual({
      id: PHOTO_B,
      focus: [0.5, 0.5],
      zoom: 1,
      brightness: 1.2,
      contrast: 0.9,
      saturation: 1.1,
      darken: 0.3,
    });
  });

  it("takes the photo away with a null id", () => {
    expect(
      applyEdit(adjusted, { type: "photo", id: null }).photo.id,
    ).toBeNull();
  });

  it("photoAdjust changes only the fields it names", () => {
    const after = applyEdit(adjusted, {
      type: "photoAdjust",
      patch: { brightness: 0.8, focus: [0.1, 0.9] },
    });
    expect(after.photo).toEqual({
      ...adjusted.photo,
      brightness: 0.8,
      focus: [0.1, 0.9],
    });
  });

  it("badge changes only the fields it names", () => {
    const after = applyEdit(recipeWith(), {
      type: "badge",
      patch: { kind: "text", text: "Sold out" },
    });
    expect(after.badge).toEqual({
      kind: "text",
      text: "Sold out",
      fill: "accent",
    });
  });

  it("panel and logo set their value", () => {
    const before = recipeWith();
    expect(applyEdit(before, { type: "panel", paint: "#1E5AA8" }).panel).toBe(
      "#1E5AA8",
    );
    expect(applyEdit(before, { type: "logo", on: false }).logo).toBe(false);
    expect(applyEdit(before, { type: "logo", on: true }).logo).toBe(true);
  });
});

describe("style", () => {
  it("sets the keys of a patch and keeps the part's others", () => {
    const before = recipeWith({
      styles: { title: { scale: 1.4, upper: true } },
    });
    const after = applyEdit(before, {
      type: "style",
      part: "title",
      patch: { weight: 800, color: "#FFFFFF" },
    });
    expect(after.styles.title).toEqual({
      scale: 1.4,
      upper: true,
      weight: 800,
      color: "#FFFFFF",
    });
  });

  it("starts the style of a part that had none", () => {
    const after = applyEdit(recipeWith(), {
      type: "style",
      part: "label",
      patch: { align: "center" },
    });
    expect(after.styles).toEqual({ label: { align: "center" } });
  });

  it("deletes a key set to undefined, so the layout's own comes back", () => {
    const before = recipeWith({
      styles: { title: { scale: 1.4, upper: true } },
    });
    const after = applyEdit(before, {
      type: "style",
      part: "title",
      patch: { scale: undefined },
    });
    expect(Object.keys(after.styles.title ?? {})).toEqual(["upper"]);
  });

  it("never writes null: the backend answers 400 to one", () => {
    const before = recipeWith({
      styles: { title: { scale: 1.4, color: "accent" } },
    });
    const after = applyEdit(before, {
      type: "style",
      part: "title",
      patch: untyped({ scale: null, color: null, font: "body" }),
    });
    expect(after.styles.title).toEqual({ font: "body" });
    // (photo.id and words.title may be null; a style value never is)
    expect(JSON.stringify(after.styles)).not.toContain("null");
  });
});

describe("remove", () => {
  it("hides a fixed part and keeps its words and style, so Undo or typing brings it back", () => {
    const before = recipeWith({
      words: { label: "", title: "Own", subtitle: "Sub" },
      styles: { subtitle: { scale: 1.2 } },
    });
    const after = applyEdit(before, { type: "remove", id: "subtitle" });
    expect(after.styles.subtitle).toEqual({ scale: 1.2, hidden: true });
    expect(after.words).toEqual(before.words);
    expect(after.extras).toEqual(before.extras);
  });

  it("hides any fixed part but the panel, the logo and badge included", () => {
    let recipe = recipeWith();
    for (const part of PARTS.filter((one) => one !== "panel")) {
      recipe = applyEdit(recipe, { type: "remove", id: part });
      expect(recipe.styles[part]?.hidden).toBe(true);
    }
    expect(recipe.styles.panel).toBeUndefined();
  });

  it("does not take the panel away: it is the cover's ground, so a Delete on it changes nothing and is no undo step", () => {
    const before = recipeWith({
      panel: "#1E5AA8",
      styles: { panel: { scale: 1.1 } },
      extras: [text("x1")],
    });
    // the same recipe, not a copy: nothing to save, nothing to undo
    expect(applyEdit(before, { type: "remove", id: "panel" })).toBe(before);

    const history = createHistory(before);
    expect(editHistory(history, { type: "remove", id: "panel" })).toBe(history);
    // the other parts still go, as one step
    const hidden = editHistory(history, { type: "remove", id: "subtitle" });
    expect(hidden).not.toBe(history);
    expect(hidden.past).toHaveLength(1);
  });

  it("names the layers a Delete can take: every one but the panel", () => {
    for (const part of PARTS)
      expect(canRemove(part), part).toBe(part !== "panel");
    expect(canRemove("x1")).toBe(true);
  });

  it("deletes an extra and every per-size frame it had, leaving the others'", () => {
    const before = recipeWith({
      extras: [text("x1"), text("x2")],
      overrides: {
        card: { x1: frame(0.3, 0.3), x2: frame(0.4, 0.4), title: frame(0, 0) },
        banner: { x1: frame(0.5, 0.5) },
      },
    });
    const after = applyEdit(before, { type: "remove", id: "x1" });
    expect(ids(after)).toEqual(["x2"]);
    // banner held only x1's frame: it goes with it
    expect(after.overrides).toEqual({
      card: { x2: frame(0.4, 0.4), title: frame(0, 0) },
    });
  });

  it("does nothing for an id that is not a layer", () => {
    const before = recipeWith({ extras: [text("x1")] });
    expect(applyEdit(before, { type: "remove", id: "nope" })).toBe(before);
  });
});

describe("addExtra", () => {
  it("appends the extra on top of the others", () => {
    const before = recipeWith({ extras: [text("x1")] });
    const after = applyEdit(before, { type: "addExtra", extra: shape("x2") });
    expect(ids(after)).toEqual(["x1", "x2"]);
    expect(after.extras[1]).toEqual(shape("x2"));
  });

  it(`stops at ${MAX_EXTRAS} extras`, () => {
    let recipe = recipeWith();
    for (let i = 0; i < MAX_EXTRAS; i++) {
      recipe = applyEdit(recipe, {
        type: "addExtra",
        extra: text(newExtraId(recipe)),
      });
    }
    expect(recipe.extras).toHaveLength(MAX_EXTRAS);
    expect(
      applyEdit(recipe, { type: "addExtra", extra: text("one-more") }),
    ).toBe(recipe);
  });

  it("gives an extra whose id the backend would refuse a fresh one", () => {
    const before = recipeWith({ extras: [text("x1")] });
    for (const bad of [
      "title", // a fixed part's
      "x1", // already used
      "Has-Capitals",
      "a".repeat(25),
      "with space",
      "",
    ]) {
      const after = applyEdit(before, { type: "addExtra", extra: text(bad) });
      expect(after.extras).toHaveLength(2);
      const added = after.extras[1]!;
      expect(added.id).toMatch(VALID_ID);
      expect(added.id).not.toBe("x1");
      expect(PARTS as readonly string[]).not.toContain(added.id);
      // the rest of the extra is untouched
      expect(added).toEqual({ ...text(bad), id: added.id });
    }
  });
});

describe("addExtra with a frame for each size", () => {
  it("writes the frames it carries as the extra's own at those sizes, in the one edit, and keeps the others'", () => {
    const before = recipeWith({
      extras: [text("x1")],
      overrides: { wide: { x1: frame(0.3, 0.3) } },
    });
    const after = applyEdit(before, {
      type: "addExtra",
      extra: shape("x2"),
      frames: { wide: frame(0.1, 0.2), banner: frame(0.3, 0.4) },
    });
    expect(ids(after)).toEqual(["x1", "x2"]);
    expect(after.overrides).toEqual({
      wide: { x1: frame(0.3, 0.3), x2: frame(0.1, 0.2) },
      banner: { x2: frame(0.3, 0.4) },
    });
    // the extra's own frame is the base the sizes without one reuse
    expect(after.extras[1]).toEqual(shape("x2"));
  });

  it("follows the id it gives an extra whose own it refused", () => {
    const before = recipeWith({ extras: [text("x1")] });
    const after = applyEdit(before, {
      type: "addExtra",
      extra: text("x1"),
      frames: { banner: frame(0.3, 0.4) },
    });
    expect(ids(after)).toEqual(["x1", "x2"]);
    expect(after.overrides).toEqual({ banner: { x2: frame(0.3, 0.4) } });
  });

  it("is one history step, and one Undo takes the extra and its frames", () => {
    const start = recipeWith();
    const history = editHistory(createHistory(start), {
      type: "addExtra",
      extra: shape("x1"),
      frames: { wide: frame(0.1, 0.1), banner: frame(0.2, 0.2) },
    });
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(start);
  });

  it("adds nothing, frames included, when the cover has all the layers it can hold", () => {
    let recipe = recipeWith();
    for (let i = 0; i < MAX_EXTRAS; i++) {
      recipe = applyEdit(recipe, {
        type: "addExtra",
        extra: text(newExtraId(recipe)),
      });
    }
    expect(
      applyEdit(recipe, {
        type: "addExtra",
        extra: text("one-more"),
        frames: { wide: frame(0.1, 0.1) },
      }),
    ).toBe(recipe);
  });

  it("without frames, writes none (an add that has the one frame for every size)", () => {
    const after = applyEdit(recipeWith(), {
      type: "addExtra",
      extra: shape("x1"),
    });
    expect(after.overrides).toEqual({});
  });
});

describe("updateExtra", () => {
  const before = recipeWith({
    extras: [
      {
        id: "t1",
        type: "text",
        text: "Hello",
        style: { scale: 1.2, upper: true },
        frame: frame(0.1, 0.1),
      },
      shape("s1"),
    ],
  });

  it("changes the fields it names, on that extra only", () => {
    const after = applyEdit(before, {
      type: "updateExtra",
      id: "t1",
      patch: { text: "Starts Monday", frame: frame(0.2, 0.2) },
    });
    expect(after.extras[0]).toEqual({
      ...before.extras[0],
      text: "Starts Monday",
      frame: frame(0.2, 0.2),
    });
    expect(after.extras[1]).toBe(before.extras[1]);
  });

  it("merges a style patch like a style action: undefined deletes a key", () => {
    const after = applyEdit(before, {
      type: "updateExtra",
      id: "t1",
      patch: { style: { weight: 800, upper: undefined } },
    });
    const style = (after.extras[0] as Extra & { type: "text" }).style;
    expect(style).toEqual({ scale: 1.2, weight: 800 });
    expect(Object.keys(style)).not.toContain("upper");
  });

  it("changes a shape's fill, shape and opacity", () => {
    const after = applyEdit(before, {
      type: "updateExtra",
      id: "s1",
      patch: { shape: "arch", fill: "#112233", opacity: 0.5 },
    });
    expect(after.extras[1]).toMatchObject({
      type: "shape",
      shape: "arch",
      fill: "#112233",
      opacity: 0.5,
    });
  });

  it("never changes an id or type, and ignores fields the extra's kind does not have", () => {
    const after = applyEdit(before, {
      type: "updateExtra",
      id: "t1",
      patch: untyped({
        id: "other",
        type: "shape",
        shape: "rect",
        opacity: 0.2,
      }),
    });
    expect(after.extras[0]).toEqual(before.extras[0]);
  });

  it("leaves a field alone when the patch sets it to undefined", () => {
    const after = applyEdit(before, {
      type: "updateExtra",
      id: "s1",
      patch: { opacity: undefined, fill: "primary" },
    });
    expect(after.extras[1]).toMatchObject({ opacity: 1, fill: "primary" });
  });

  it("does nothing for an id that is not an extra", () => {
    expect(
      applyEdit(before, {
        type: "updateExtra",
        id: "title",
        patch: { text: "x" },
      }),
    ).toBe(before);
  });
});

describe("duplicate", () => {
  it("offsets the copy by 0.03 in x and y, puts it on top, and leaves the original", () => {
    const original = text("x1", frame(0.1, 0.2, 0.4, 0.15));
    const before = recipeWith({ extras: [original, shape("x2")] });
    const after = applyEdit(before, { type: "duplicate", id: "x1" });
    expect(after.extras).toHaveLength(3);
    expect(after.extras[0]).toEqual(original);
    const copy = after.extras[2]!;
    expect(copy).toMatchObject({ type: "text", text: "Text x1" });
    expect(copy.frame.x).toBeCloseTo(0.13, 10);
    expect(copy.frame.y).toBeCloseTo(0.23, 10);
    expect(copy.frame.w).toBe(0.4);
    expect(copy.frame.h).toBe(0.15);
  });

  it("gives the copy a fresh id the backend accepts, however often it is copied", () => {
    let recipe = recipeWith({ extras: [text("x1")] });
    const seen = new Set(["x1"]);
    for (let i = 1; i < MAX_EXTRAS; i++) {
      // copy the copy as well as the original
      const source = recipe.extras[recipe.extras.length - 1]!.id;
      recipe = applyEdit(recipe, { type: "duplicate", id: source });
      const copy = recipe.extras[recipe.extras.length - 1]!;
      expect(copy.id).toMatch(VALID_ID);
      expect(PARTS as readonly string[]).not.toContain(copy.id);
      expect(seen.has(copy.id)).toBe(false);
      seen.add(copy.id);
    }
    expect(recipe.extras).toHaveLength(MAX_EXTRAS);
  });

  it("copies the extra's per-size frames, offset the same way, and nobody else's", () => {
    const before = recipeWith({
      extras: [text("x1")],
      overrides: {
        card: { x1: frame(0.3, 0.4), title: frame(0.1, 0.1) },
        banner: { title: frame(0.2, 0.2) },
      },
    });
    const after = applyEdit(before, { type: "duplicate", id: "x1" });
    const copyId = after.extras[1]!.id;
    expect(after.overrides.card?.[copyId]?.x).toBeCloseTo(0.33, 10);
    expect(after.overrides.card?.[copyId]?.y).toBeCloseTo(0.43, 10);
    expect(after.overrides.card?.x1).toEqual(frame(0.3, 0.4));
    expect(after.overrides.card?.title).toEqual(frame(0.1, 0.1));
    // no frame for the copy at a size the original had none
    expect(after.overrides.banner).toEqual({ title: frame(0.2, 0.2) });
  });

  it("works on extras only: a fixed part or an unknown id is left as it is", () => {
    const before = recipeWith({ extras: [text("x1")] });
    expect(applyEdit(before, { type: "duplicate", id: "title" })).toBe(before);
    expect(applyEdit(before, { type: "duplicate", id: "nope" })).toBe(before);
  });

  it(`does nothing when ${MAX_EXTRAS} extras exist`, () => {
    let recipe = recipeWith();
    for (let i = 0; i < MAX_EXTRAS; i++) {
      recipe = applyEdit(recipe, {
        type: "addExtra",
        extra: text(newExtraId(recipe)),
      });
    }
    expect(applyEdit(recipe, { type: "duplicate", id: "x1" })).toBe(recipe);
  });
});

describe("order", () => {
  const before = recipeWith({ extras: [text("a"), text("b"), text("c")] });

  it("forward swaps the extra with the one above it", () => {
    expect(
      ids(applyEdit(before, { type: "order", id: "a", dir: "forward" })),
    ).toEqual(["b", "a", "c"]);
    expect(
      ids(applyEdit(before, { type: "order", id: "b", dir: "forward" })),
    ).toEqual(["a", "c", "b"]);
  });

  it("back swaps it with the one below", () => {
    expect(
      ids(applyEdit(before, { type: "order", id: "c", dir: "back" })),
    ).toEqual(["a", "c", "b"]);
    expect(
      ids(applyEdit(before, { type: "order", id: "b", dir: "back" })),
    ).toEqual(["b", "a", "c"]);
  });

  it("does nothing at the top or bottom of the stack", () => {
    expect(applyEdit(before, { type: "order", id: "c", dir: "forward" })).toBe(
      before,
    );
    expect(applyEdit(before, { type: "order", id: "a", dir: "back" })).toBe(
      before,
    );
  });

  it("moves extras only: fixed parts keep their stacking order", () => {
    expect(
      applyEdit(before, { type: "order", id: "title", dir: "forward" }),
    ).toBe(before);
    expect(applyEdit(before, { type: "order", id: "nope", dir: "back" })).toBe(
      before,
    );
  });
});

describe("frame", () => {
  it("writes the frame for that size only", () => {
    const before = recipeWith({
      overrides: { card: { title: frame(0.1, 0.1) } },
    });
    const after = applyEdit(before, {
      type: "frame",
      size: "banner",
      id: "logo",
      frame: frame(0.7, 0.05),
    });
    expect(after.overrides).toEqual({
      card: { title: frame(0.1, 0.1) },
      banner: { logo: frame(0.7, 0.05) },
    });
    // nothing else moved
    expect({ ...after, overrides: before.overrides }).toEqual(before);
  });

  it("replaces that layer's frame at that size and keeps the size's other layers", () => {
    const before = recipeWith({
      overrides: { wide: { title: frame(0.1, 0.1), logo: frame(0.8, 0.1) } },
    });
    const after = applyEdit(before, {
      type: "frame",
      size: "wide",
      id: "title",
      frame: frame(0.2, 0.3),
    });
    expect(after.overrides.wide).toEqual({
      title: frame(0.2, 0.3),
      logo: frame(0.8, 0.1),
    });
  });

  it("moves an extra at one size without touching its own frame", () => {
    const before = recipeWith({ extras: [text("x1", frame(0.1, 0.1))] });
    const after = applyEdit(before, {
      type: "frame",
      size: "card",
      id: "x1",
      frame: frame(0.5, 0.5),
    });
    expect(after.extras).toEqual(before.extras);
    expect(after.overrides).toEqual({ card: { x1: frame(0.5, 0.5) } });
  });
});

describe("a part she removed comes back when she sets what it shows", () => {
  // (built, not removed: an old draft hid its panel, which Delete no longer can)
  const gone = (part: PartId) =>
    recipeWith({
      styles: { [part]: { scale: 1.2, hidden: true } } as CoverRecipe["styles"],
    });

  it("typing in a word brings back that word only", () => {
    let recipe = gone("label");
    recipe = applyEdit(recipe, { type: "remove", id: "subtitle" });
    const after = applyEdit(recipe, {
      type: "words",
      patch: { label: "Spring" },
    });
    expect(after.styles.label).toEqual({ scale: 1.2 });
    expect(after.styles.subtitle).toEqual({ hidden: true });
  });

  it("a new photo, a colour, the logo switch and the badge bring back theirs", () => {
    expect(
      applyEdit(gone("photo"), { type: "photo", id: PHOTO_A }).styles.photo,
    ).toEqual({ scale: 1.2 });
    expect(
      applyEdit(gone("panel"), { type: "panel", paint: "accent" }).styles.panel,
    ).toEqual({ scale: 1.2 });
    expect(
      applyEdit(gone("logo"), { type: "logo", on: true }).styles.logo,
    ).toEqual({ scale: 1.2 });
    expect(
      applyEdit(gone("badge"), { type: "badge", patch: { kind: "live" } })
        .styles.badge,
    ).toEqual({ scale: 1.2 });
  });

  it("switching the logo off does not", () => {
    const recipe = gone("logo");
    expect(applyEdit(recipe, { type: "logo", on: false }).styles).toEqual(
      recipe.styles,
    );
  });

  it("a part that was never removed keeps its styles object as it is", () => {
    const before = recipeWith({ styles: { title: { scale: 1.2 } } });
    const after = applyEdit(before, { type: "words", patch: { title: "Hi" } });
    expect(after.styles).toBe(before.styles);
  });
});

describe("newExtraId", () => {
  it("is valid, unused and not a part's id; the same recipe always gives the same id", () => {
    const recipe = recipeWith({ extras: [text("x1"), text("x2")] });
    expect(newExtraId(recipe)).toBe("x3");
    expect(newExtraId(recipe)).toBe(newExtraId(recipe));
    expect(newExtraId(recipeWith())).toBe("x1");
  });

  it("derives a copy's id from its source's", () => {
    const recipe = recipeWith({ extras: [text("x1"), text("x2")] });
    expect(newExtraId(recipe, "x1")).toBe("x3");
    const long = "a".repeat(24);
    expect(newExtraId(recipeWith({ extras: [text(long)] }), long)).toMatch(
      VALID_ID,
    );
  });

  it("never gives a part's id: it ends in a number, which no part's id does", () => {
    // if a part is ever named like "overlay2", newExtraId must skip the part ids again
    expect(PARTS.filter((part) => /\d$/.test(part))).toEqual([]);
    const id = newExtraId(recipeWith(), "title");
    expect(PARTS as readonly string[]).not.toContain(id);
    expect(id).toMatch(VALID_ID);
  });
});

describe("coalesceKey", () => {
  const words = (patch: Partial<CoverRecipe["words"]>) =>
    coalesceKey({ type: "words", patch });

  it("a field coalesces with itself and not with another", () => {
    expect(words({ title: "H" })).toBe(words({ title: "Hi" }));
    expect(words({ title: "H" })).not.toBeNull();
    expect(words({ title: "H" })).not.toBe(words({ subtitle: "H" }));
  });

  it("sliders coalesce by part and field", () => {
    const style = (part: PartId, patch: Partial<PartStyle>) =>
      coalesceKey({ type: "style", part, patch });
    expect(style("title", { scale: 1.1 })).toBe(style("title", { scale: 1.2 }));
    expect(style("title", { scale: 1.1 })).not.toBe(
      style("title", { leading: 1.2 }),
    );
    expect(style("title", { scale: 1.1 })).not.toBe(
      style("label", { scale: 1.1 }),
    );
    const adjust = (patch: Partial<CoverRecipe["photo"]>) =>
      coalesceKey({ type: "photoAdjust", patch });
    expect(adjust({ zoom: 1.5 })).toBe(adjust({ zoom: 1.6 }));
    expect(adjust({ zoom: 1.5 })).not.toBe(adjust({ darken: 0.2 }));
    expect(coalesceKey({ type: "panel", paint: "#112233" })).toBe(
      coalesceKey({ type: "panel", paint: "#112234" }),
    );
  });

  it("a drag coalesces by size and layer", () => {
    const drag = (size: "card" | "banner", id: string) =>
      coalesceKey({ type: "frame", size, id, frame: frame(0, 0) });
    expect(drag("card", "title")).toBe(drag("card", "title"));
    expect(drag("card", "title")).not.toBe(drag("banner", "title"));
    expect(drag("card", "title")).not.toBe(drag("card", "logo"));
  });

  it("an extra's text and style coalesce by extra and field", () => {
    const update = (id: string, patch: ExtraPatch) =>
      coalesceKey({ type: "updateExtra", id, patch });
    expect(update("x1", { text: "a" })).toBe(update("x1", { text: "ab" }));
    expect(update("x1", { text: "a" })).not.toBe(update("x2", { text: "a" }));
    expect(update("x1", { style: { scale: 1 } })).toBe(
      update("x1", { style: { scale: 2 } }),
    );
    expect(update("x1", { style: { scale: 1 } })).not.toBe(
      update("x1", { style: { tracking: 0.1 } }),
    );
  });

  it("layout, photo, set, logo, adds, removes, copies and order never coalesce", () => {
    const actions: EditorAction[] = [
      { type: "layout", layout: "full" },
      { type: "photo", id: PHOTO_A },
      { type: "applySet", set: recipeWith() },
      { type: "logo", on: true },
      { type: "addExtra", extra: text("x1") },
      { type: "remove", id: "x1" },
      { type: "duplicate", id: "x1" },
      { type: "order", id: "x1", dir: "forward" },
    ];
    for (const action of actions) expect(coalesceKey(action)).toBeNull();
  });
});

describe("history", () => {
  /** Dispatches the actions the way the editor does, `gap` ms apart. */
  const run = (
    history: EditHistory<CoverRecipe>,
    actions: EditorAction[],
    gap = 50,
    from = 1000,
  ) =>
    actions.reduce(
      (h, action, i) =>
        push(
          h,
          applyEdit(h.present, action),
          coalesceKey(action),
          from + i * gap,
        ),
      history,
    );
  /** One action per keystroke, as the field's onChange sends them. */
  const typed = (field: "title" | "subtitle", value: string): EditorAction[] =>
    [...value].map((_, i) => {
      const so_far = value.slice(0, i + 1);
      return {
        type: "words",
        patch: field === "title" ? { title: so_far } : { subtitle: so_far },
      };
    });

  it("typing in a word five times is one undo step", () => {
    const start = recipeWith();
    const history = run(createHistory(start), typed("title", "Hello"));
    expect(history.past).toHaveLength(1);
    expect(history.present.words.title).toBe("Hello");
    expect(undo(history).present).toBe(start);
    expect(redo(undo(history)).present.words.title).toBe("Hello");
  });

  it("another field, or a pause over 400 ms, starts a new step", () => {
    const start = recipeWith();
    const both = run(createHistory(start), [
      ...typed("title", "Hi"),
      ...typed("subtitle", "Yo"),
    ]);
    expect(both.past).toHaveLength(2);
    const paused = push(
      run(createHistory(start), typed("title", "Hi")),
      applyEdit(start, { type: "words", patch: { title: "Hiya" } }),
      coalesceKey({ type: "words", patch: { title: "Hiya" } }),
      1000 + 500,
    );
    expect(paused.past).toHaveLength(2);
  });

  it("changing the layout twice in a row is two steps", () => {
    const history = run(createHistory(recipeWith()), [
      { type: "layout", layout: "full" },
      { type: "layout", layout: "band" },
    ]);
    expect(history.past).toHaveLength(2);
    expect(undo(history).present.layout).toBe("full");
  });

  it("dragging a layer is one step, and the next layer another", () => {
    const history = run(createHistory(recipeWith()), [
      { type: "frame", size: "card", id: "title", frame: frame(0.1, 0.1) },
      { type: "frame", size: "card", id: "title", frame: frame(0.12, 0.1) },
      { type: "frame", size: "card", id: "title", frame: frame(0.14, 0.1) },
      { type: "frame", size: "card", id: "logo", frame: frame(0.5, 0.1) },
    ]);
    expect(history.past).toHaveLength(2);
    expect(undo(history).present.overrides.card).toEqual({
      title: frame(0.14, 0.1),
    });
    expect(undo(undo(history)).present.overrides).toEqual({});
  });
});

describe("what reaches the server", () => {
  it("holds in a long session: no null in a style, valid unique extra ids, at most 12 extras, no empty or stale override", () => {
    const actions: EditorAction[] = [
      { type: "style", part: "title", patch: { scale: 1.2, color: "accent" } },
      { type: "style", part: "title", patch: { scale: undefined } },
      { type: "style", part: "title", patch: untyped({ color: null }) },
      { type: "addExtra", extra: text("title") },
      { type: "addExtra", extra: shape("x1") },
      { type: "addExtra", extra: text("x1") },
      { type: "frame", size: "wide", id: "title", frame: frame(0.1, 0.1) },
      { type: "frame", size: "banner", id: "x1", frame: frame(0.1, 0.1) },
      { type: "duplicate", id: "x1" },
      { type: "layout", layout: "band" },
      { type: "remove", id: "x1" },
      { type: "remove", id: "logo" },
      { type: "applySet", set: recipeWith({ layout: "framed" }) },
      { type: "words", patch: { title: "  " } },
      { type: "updateExtra", id: "x2", patch: { opacity: 0.4 } },
      { type: "order", id: "x2", dir: "back" },
    ];
    let recipe = recipeWith();
    for (const action of actions) {
      recipe = applyEdit(recipe, action);
      const layers = new Set<string>([...PARTS, ...ids(recipe)]);
      expect(recipe.extras.length).toBeLessThanOrEqual(MAX_EXTRAS);
      expect(new Set(ids(recipe)).size).toBe(recipe.extras.length);
      for (const extra of recipe.extras) {
        expect(extra.id).toMatch(VALID_ID);
        expect(PARTS as readonly string[]).not.toContain(extra.id);
      }
      for (const [size, frames] of Object.entries(recipe.overrides)) {
        expect(
          Object.keys(frames).length,
          `${size} is not empty`,
        ).toBeGreaterThan(0);
        for (const id of Object.keys(frames)) expect(layers.has(id)).toBe(true);
      }
      for (const style of Object.values(recipe.styles))
        expect(Object.values(style)).not.toContain(null);
    }
  });
});

describe("applyEdit: a photo with its place known", () => {
  it("takes the subject's focus, an edit's focus and zoom, and a cutout's layout in one step", () => {
    const start = applyEdit(defaultRecipe({ photoId: "p1" }), {
      type: "photoAdjust",
      patch: { focus: [0.2, 0.3], zoom: 2, grade: "mono" },
    });
    const library = applyEdit(start, {
      type: "photo",
      id: "p2",
      focus: [0.75, 0.5],
    });
    expect(library.photo).toMatchObject({
      id: "p2",
      focus: [0.75, 0.5],
      zoom: 1,
      grade: "mono",
    });
    const edited = applyEdit(start, {
      type: "photo",
      id: "p3",
      focus: [0.2, 0.3],
      zoom: 2,
    });
    expect(edited.photo).toMatchObject({
      id: "p3",
      focus: [0.2, 0.3],
      zoom: 2,
    });
    const withTitleFrame = applyEdit(start, {
      type: "frame",
      size: "card",
      id: "title",
      frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 },
    });
    const cut = applyEdit(withTitleFrame, {
      type: "photo",
      id: "p4",
      layout: "cutout",
    });
    expect(cut.layout).toBe("cutout");
    // the title's place was one in the old layout
    expect(cut.overrides).toEqual({});
    // the same layout keeps her frames
    expect(
      applyEdit(withTitleFrame, { type: "photo", id: "p4", layout: "panel" })
        .overrides,
    ).toEqual(withTitleFrame.overrides);
  });
});
