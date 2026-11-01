import { describe, expect, it, vi } from "vitest";
import { revealInList } from "@shared/ui/tabs";

// Fake elements: only the geometry the helper reads.
function fakeList(left: number, width: number, scrollWidth: number) {
  return {
    scrollLeft: 0,
    scrollWidth,
    clientWidth: width,
    getBoundingClientRect: () => ({ left, right: left + width }),
  };
}
function fakeTrigger(left: number, width: number) {
  return {
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({ left, right: left + width }),
  };
}
const reveal = (l: unknown, t: unknown) =>
  revealInList(l as HTMLElement, t as HTMLElement);

describe("revealInList", () => {
  it("never calls scrollIntoView (it scrolls the window too)", () => {
    const list = fakeList(0, 300, 600);
    const trigger = fakeTrigger(400, 100);
    reveal(list, trigger);
    expect(trigger.scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves a list that does not overflow alone", () => {
    const list = fakeList(0, 300, 300);
    reveal(list, fakeTrigger(400, 100));
    expect(list.scrollLeft).toBe(0);
  });

  it("scrolls the list right to show a tab past its right edge", () => {
    const list = fakeList(10, 300, 600);
    reveal(list, fakeTrigger(350, 100)); // right edge 450, list right edge 310
    expect(list.scrollLeft).toBe(140);
  });

  it("scrolls the list left to show a tab before its left edge", () => {
    const list = fakeList(10, 300, 600);
    list.scrollLeft = 200;
    reveal(list, fakeTrigger(-40, 100)); // 50 px left of the list
    expect(list.scrollLeft).toBe(150);
  });

  it("does nothing for a tab already in view", () => {
    const list = fakeList(0, 300, 600);
    reveal(list, fakeTrigger(20, 100));
    expect(list.scrollLeft).toBe(0);
  });
});
