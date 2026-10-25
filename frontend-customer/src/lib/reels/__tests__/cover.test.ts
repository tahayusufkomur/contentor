import { describe, expect, it } from "vitest";
import {
  focus,
  hookParts,
  hookScale,
  inkOn,
  plainHook,
  wordsOnTop,
} from "../cover";

describe("the hook", () => {
  it("lights the word in stars", () => {
    expect(hookParts("The stretch I *stopped* teaching")).toEqual([
      { text: "The stretch I ", lit: false },
      { text: "stopped", lit: true },
      { text: " teaching", lit: false },
    ]);
  });

  it("leaves a hook without stars whole, and a stray star out", () => {
    expect(hookParts("No stars here")).toEqual([
      { text: "No stars here", lit: false },
    ]);
    expect(hookParts("A *lone star")).toEqual([
      { text: "A lone star", lit: false },
    ]);
    expect(plainHook("The *one*  thing")).toBe("The one thing");
  });

  it("steps a long hook down", () => {
    expect(hookScale("Short hook")).toBe(1);
    expect(hookScale("x".repeat(60))).toBeLessThan(0.8);
  });
});

describe("the frame", () => {
  it("brings a face on the left of a wide frame into the 9:16 window", () => {
    // 16:9 frame, face centred at a tenth of its width: the window as far left as it goes
    expect(focus(16 / 9, 9 / 16, [0.05, 0.2, 0.1, 0.2])).toBe("0% 50%");
    expect(focus(16 / 9, 9 / 16, [0.45, 0.2, 0.1, 0.2])).toBe("50% 50%");
    const [x] = focus(16 / 9, 9 / 16, [0.6, 0.2, 0.1, 0.2]).split(" ");
    expect(parseFloat(x)).toBeGreaterThan(50);
  });

  it("moves a tall frame up or down instead", () => {
    const [, y] = focus(9 / 20, 9 / 16, [0.4, 0.1, 0.2, 0.1]).split(" ");
    expect(parseFloat(y)).toBe(0);
  });

  it("keeps the middle without a face", () => {
    expect(focus(16 / 9, 9 / 16, null)).toBe("50% 50%");
    expect(focus(null, 9 / 16, [0.1, 0.1, 0.1, 0.1])).toBe("50% 50%");
  });

  it("puts the words where the face is not", () => {
    expect(wordsOnTop([0.4, 0.15, 0.2, 0.2])).toBe(false);
    expect(wordsOnTop([0.4, 0.55, 0.2, 0.2])).toBe(true);
    expect(wordsOnTop(null)).toBe(false);
  });
});

describe("ink", () => {
  it("is dark on a light colour and white on a dark one", () => {
    expect(inkOn("#FFD43B")).toBe("#111111");
    expect(inkOn("#1F2A2E")).toBe("#ffffff");
    expect(inkOn("nope")).toBe("#ffffff");
  });
});
