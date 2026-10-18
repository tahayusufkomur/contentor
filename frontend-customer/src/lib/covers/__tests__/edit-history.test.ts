import { describe, expect, it } from "vitest";
import { editHistory } from "@/lib/covers/editor";
import { defaultRecipe } from "@/lib/covers/recipe";
import { canUndo, createHistory, undo } from "@/lib/logo/history";

describe("editHistory", () => {
  it("makes the edit the present and the recipe before it one undo step", () => {
    const start = createHistory(defaultRecipe());
    const after = editHistory(start, { type: "layout", layout: "full" });
    expect(after.present.layout).toBe("full");
    expect(canUndo(after)).toBe(true);
    expect(undo(after).present).toEqual(start.present);
  });

  it("leaves the history as it is when the action changes nothing", () => {
    const start = createHistory(defaultRecipe());
    // she taps the layout she is on: the reducer builds a new recipe, but an equal one
    expect(editHistory(start, { type: "layout", layout: "panel" })).toBe(start);
    expect(editHistory(start, { type: "words", patch: { label: "" } })).toBe(
      start,
    );
    expect(editHistory(start, { type: "remove", id: "no-such-layer" })).toBe(
      start,
    );
  });

  it("makes typing in one word a single undo step", () => {
    let history = createHistory(defaultRecipe());
    const at = 1_000_000;
    for (const [i, title] of ["Y", "Yo", "Yog", "Yoga"].entries()) {
      history = editHistory(
        history,
        { type: "words", patch: { title } },
        at + i * 50,
      );
    }
    expect(history.present.words.title).toBe("Yoga");
    expect(history.past).toHaveLength(1);
    expect(undo(history).present.words.title).toBeNull();
  });

  it("keeps edits to different words, and a pause in typing, as separate steps", () => {
    let history = createHistory(defaultRecipe());
    history = editHistory(
      history,
      { type: "words", patch: { title: "Yoga" } },
      1000,
    );
    history = editHistory(
      history,
      { type: "words", patch: { subtitle: "Slow" } },
      1050,
    );
    expect(history.past).toHaveLength(2);
    history = editHistory(
      history,
      { type: "words", patch: { subtitle: "Slow flow" } },
      5000,
    );
    expect(history.past).toHaveLength(3);
  });

  it("clears redo, as any new edit does", () => {
    let history = editHistory(createHistory(defaultRecipe()), {
      type: "layout",
      layout: "full",
    });
    history = undo(history);
    expect(history.future).toHaveLength(1);
    history = editHistory(history, { type: "layout", layout: "band" });
    expect(history.future).toHaveLength(0);
  });
});
