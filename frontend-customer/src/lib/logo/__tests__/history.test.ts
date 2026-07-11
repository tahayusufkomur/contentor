import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  reset,
  undo,
} from "@/lib/logo/history";

describe("history", () => {
  it("starts empty with no undo/redo available", () => {
    const h = createHistory(0);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("push then undo returns to the previous value and enables redo", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    expect(h2.present).toBe(0);
    expect(canUndo(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);
  });

  it("redo replays the value undo stepped back from", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    const h3 = redo(h2);
    expect(h3.present).toBe(1);
    expect(canRedo(h3)).toBe(false);
  });

  it("a fresh push after undo drops the redo branch", () => {
    const h1 = push(createHistory(0), 1);
    const h2 = undo(h1);
    const h3 = push(h2, 2);
    expect(h3.present).toBe(2);
    expect(canRedo(h3)).toBe(false);
    expect(undo(h3).present).toBe(0);
  });

  it("undo/redo on an empty stack is a no-op", () => {
    const h = createHistory(0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("coalesces consecutive pushes with the same key within the window", () => {
    let h = createHistory("a");
    h = push(h, "ab", "typing", 1000);
    h = push(h, "abc", "typing", 1100);
    expect(h.present).toBe("abc");
    expect(canUndo(h)).toBe(true);
    const back = undo(h);
    expect(back.present).toBe("a"); // one coalesced step, not two
  });

  it("does not coalesce across the coalesce window", () => {
    let h = createHistory("a");
    h = push(h, "ab", "typing", 1000);
    h = push(h, "abc", "typing", 1500); // 500ms later, window is 400ms
    expect(undo(h).present).toBe("ab");
    expect(undo(undo(h)).present).toBe("a");
  });

  it("does not coalesce a null key", () => {
    let h = createHistory(0);
    h = push(h, 1, null, 1000);
    h = push(h, 2, null, 1001);
    expect(undo(h).present).toBe(1);
    expect(undo(undo(h)).present).toBe(0);
  });

  it("caps the past stack at 100 entries", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 105; i++) h = push(h, i, null, i);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]!.value).toBe(5); // oldest 5 entries dropped
  });

  it("reset replaces the whole history with a fresh baseline", () => {
    let h = createHistory(0);
    h = push(h, 1, null, 1);
    h = push(h, 2, null, 2);
    const baselined = reset(h.present + 100);
    expect(baselined.present).toBe(102);
    expect(canUndo(baselined)).toBe(false);
    expect(canRedo(baselined)).toBe(false);
  });
});
