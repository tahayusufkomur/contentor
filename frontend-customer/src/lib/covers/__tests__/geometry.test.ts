import { describe, expect, it } from "vitest";
import {
  hitTest,
  moveFrame,
  panFocus,
  resizeDrawn,
  resizeFrame,
  scaleAbout,
  snap,
  snapDrawn,
  type Handle,
} from "@/lib/covers/geometry";
import type { Frame } from "@/types/design";

const frame = (x: number, y: number, w: number, h: number): Frame => ({
  x,
  y,
  w,
  h,
});
/** A frozen frame: a function that writes to its input throws. */
const frozen = (f: Frame): Frame => Object.freeze({ ...f });
const right = (f: Frame) => f.x + f.w;
const bottom = (f: Frame) => f.y + f.h;
const middleX = (f: Frame) => f.x + f.w / 2;
const middleY = (f: Frame) => f.y + f.h / 2;
function expectFrame(actual: Frame, expected: Frame) {
  for (const key of ["x", "y", "w", "h"] as const) {
    expect(actual[key], key).toBeCloseTo(expected[key], 9);
  }
}

describe("moveFrame", () => {
  it("moves a frame by the drag and keeps its size", () => {
    expectFrame(
      moveFrame(frozen(frame(0.1, 0.2, 0.3, 0.4)), 0.05, -0.1),
      frame(0.15, 0.1, 0.3, 0.4),
    );
  });

  it("keeps x and y inside the range the server keeps (-0.5 to 1.5)", () => {
    const far = moveFrame(frame(0.1, 0.1, 0.2, 0.2), 9, -9);
    expect(far.x).toBe(1.5);
    expect(far.y).toBe(-0.5);
    expect(far.w).toBe(0.2);
  });
});

describe("resizeFrame", () => {
  const start = frame(0.2, 0.3, 0.4, 0.2);

  it("from nw moves the origin and keeps the opposite corner", () => {
    const next = resizeFrame(frozen(start), "nw", -0.1, -0.05, false);
    expectFrame(next, frame(0.1, 0.25, 0.5, 0.25));
    expect(right(next)).toBeCloseTo(right(start), 9);
    expect(bottom(next)).toBeCloseTo(bottom(start), 9);
  });

  it.each<[Handle, number, number, Frame]>([
    ["se", 0.1, 0.05, frame(0.2, 0.3, 0.5, 0.25)],
    ["ne", 0.1, -0.05, frame(0.2, 0.25, 0.5, 0.25)],
    ["sw", -0.1, 0.05, frame(0.1, 0.3, 0.5, 0.25)],
  ])("from %s keeps the opposite corner", (handle, dx, dy, expected) => {
    expectFrame(resizeFrame(start, handle, dx, dy, false), expected);
  });

  it("an edge changes one side only", () => {
    expectFrame(
      resizeFrame(start, "e", 0.1, 0.5, false),
      frame(0.2, 0.3, 0.5, 0.2),
    );
    expectFrame(
      resizeFrame(start, "w", 0.1, 0.5, false),
      frame(0.3, 0.3, 0.3, 0.2),
    );
    expectFrame(
      resizeFrame(start, "n", 0.5, -0.1, false),
      frame(0.2, 0.2, 0.4, 0.3),
    );
    expectFrame(
      resizeFrame(start, "s", 0.5, 0.1, false),
      frame(0.2, 0.3, 0.4, 0.3),
    );
  });

  it("never gets smaller than 0.02, and the opposite edge stays put", () => {
    const squeezed = resizeFrame(start, "nw", 0.9, 0.9, false);
    expect(squeezed.w).toBe(0.02);
    expect(squeezed.h).toBe(0.02);
    expect(right(squeezed)).toBeCloseTo(right(start), 9);
    expect(bottom(squeezed)).toBeCloseTo(bottom(start), 9);
    const east = resizeFrame(start, "e", -9, 0, false);
    expect(east.w).toBe(0.02);
    expect(east.x).toBe(0.2);
  });

  it("never gets bigger than 2", () => {
    const next = resizeFrame(start, "se", 9, 9, false);
    expect(next.w).toBe(2);
    expect(next.h).toBe(2);
  });

  it("a ratio-locked resize keeps w/h", () => {
    const next = resizeFrame(frozen(start), "se", 0.2, 0.1, true);
    expect(next.w / next.h).toBeCloseTo(start.w / start.h, 9);
    // the pointer went along the diagonal by half of it
    expect(next.w).toBeCloseTo(0.6, 9);
    expect(next.h).toBeCloseTo(0.3, 9);
    expect(next.x).toBe(start.x);
    expect(next.y).toBe(start.y);
    // across alone is a part of the way along it
    const across = resizeFrame(start, "se", 0.1, 0, true);
    expect(across.w / across.h).toBeCloseTo(2, 9);
    expect(across.w).toBeCloseTo(0.48, 9);
  });

  it("a ratio-locked corner stays as near the pointer as the frame's shape allows, in px", () => {
    // The canvas is twice as wide as high, so this frame is 0.8 x 0.2 on the screen.
    const aspect = 2;
    for (const [dx, dy] of [
      [0.1, 0.1],
      [-0.06, 0.04],
      [0.02, -0.08],
    ]) {
      const next = resizeFrame(start, "se", dx, dy, true, aspect);
      expect(next.w / next.h).toBeCloseTo(2, 9);
      // on screen, from the new corner to the pointer is square to the frame's diagonal
      const corner = [(next.x + next.w) * aspect, next.y + next.h];
      const pointer = [
        (start.x + start.w + dx) * aspect,
        start.y + start.h + dy,
      ];
      const diagonal = [start.w * aspect, start.h];
      const off = [pointer[0] - corner[0], pointer[1] - corner[1]];
      expect(off[0] * diagonal[0] + off[1] * diagonal[1]).toBeCloseTo(0, 9);
    }
  });

  it("a ratio-locked corner keeps the opposite corner, whichever corner it is", () => {
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      const next = resizeFrame(start, handle, 0.07, -0.13, true);
      expect(next.w / next.h, handle).toBeCloseTo(2, 9);
      // the opposite corner: the right edge when the handle is on the left, and so on
      expect(handle.includes("w") ? right(next) : next.x, handle).toBeCloseTo(
        handle.includes("w") ? right(start) : start.x,
        9,
      );
      expect(handle.includes("n") ? bottom(next) : next.y, handle).toBeCloseTo(
        handle.includes("n") ? bottom(start) : start.y,
        9,
      );
    }
  });

  it("a ratio-locked edge scales the other side about the middle", () => {
    const next = resizeFrame(start, "e", 0.2, 0, true);
    expectFrame(next, frame(0.2, 0.25, 0.6, 0.3));
    expect(middleY(next)).toBeCloseTo(middleY(start), 9);
    const up = resizeFrame(start, "n", 0, -0.1, true);
    expect(up.h).toBeCloseTo(0.3, 9);
    expect(up.w).toBeCloseTo(0.6, 9);
    expect(bottom(up)).toBeCloseTo(bottom(start), 9);
    expect(middleX(up)).toBeCloseTo(middleX(start), 9);
  });

  it("a ratio-locked resize stops at the smallest size too", () => {
    const next = resizeFrame(start, "se", -9, -9, true);
    expect(Math.min(next.w, next.h)).toBeCloseTo(0.02, 9);
    expect(next.w / next.h).toBeCloseTo(2, 9);
  });
});

describe("scaleAbout", () => {
  it("scales a frame about a point and leaves that point where it is", () => {
    expectFrame(
      scaleAbout(frame(0.2, 0.2, 0.5, 0.1), 0.2, 0.2, 2),
      frame(0.2, 0.2, 1, 0.2),
    );
    expectFrame(
      scaleAbout(frame(0.2, 0.2, 0.4, 0.2), 0.6, 0.4, 0.5),
      frame(0.4, 0.3, 0.2, 0.1),
    );
  });
});

describe("resizeDrawn", () => {
  // A logo's frame is five times as wide as high, and a square mark fills the left of it.
  const logo = frame(0.1, 0.1, 0.5, 0.1);
  const mark = frame(0.1, 0.1, 0.1, 0.1);

  it("scales the frame with the mark about the corner that holds still", () => {
    expectFrame(
      resizeDrawn(logo, mark, "se", 0.05, 0.05),
      frame(0.1, 0.1, 0.75, 0.15),
    );
    expectFrame(
      resizeDrawn(logo, mark, "nw", -0.05, -0.05),
      frame(0.05, 0.05, 0.75, 0.15),
    );
  });

  it("tracks the pointer in px on a canvas that is not square", () => {
    // across by 0.05 of a canvas twice as wide as high is 0.1 of its height: the mark grows by 1.4
    const wide = resizeDrawn(logo, mark, "se", 0.05, 0, 2);
    expect(wide.w / wide.h).toBeCloseTo(5, 9);
    expect(wide.w).toBeCloseTo(0.7, 9);
    // and by 1.25 on a square one
    expect(resizeDrawn(logo, mark, "se", 0.05, 0).w).toBeCloseTo(0.625, 9);
  });

  it("keeps the mark's shape, and the frame's, whichever way the pointer goes", () => {
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      const next = resizeDrawn(logo, mark, handle, 0.03, -0.08);
      expect(next.w / next.h, handle).toBeCloseTo(5, 9);
    }
  });
});

describe("snap", () => {
  it("snaps the middle to 0.5 within the tolerance and reports the guide", () => {
    const result = snap(frozen(frame(0.305, 0.1, 0.4, 0.2)));
    expect(result.guides).toEqual({ x: 0.5 });
    expect(middleX(result.frame)).toBeCloseTo(0.5, 9);
    expect(result.frame.y).toBe(0.1);
    expect(result.frame.w).toBe(0.4);
  });

  it("snaps an edge to 0 or 1", () => {
    const left = snap(frame(0.01, 0.3, 0.2, 0.1));
    expect(left.guides).toEqual({ x: 0 });
    expect(left.frame.x).toBeCloseTo(0, 9);
    const base = snap(frame(0.1, 0.895, 0.2, 0.1));
    expect(base.guides).toEqual({ y: 1 });
    expect(bottom(base.frame)).toBeCloseTo(1, 9);
    const edge = snap(frame(0.795, 0.3, 0.2, 0.1));
    expect(edge.guides).toEqual({ x: 1 });
    expect(right(edge.frame)).toBeCloseTo(1, 9);
  });

  it("snaps each axis on its own", () => {
    const both = snap(frame(0.4, 0.45, 0.2, 0.1));
    expect(both.guides).toEqual({ x: 0.5, y: 0.5 });
    expectFrame(both.frame, frame(0.4, 0.45, 0.2, 0.1));
    expect(snap(frame(0.4, 0.2, 0.2, 0.1)).guides).toEqual({ x: 0.5 });
  });

  it("leaves a frame alone beyond the tolerance, and reports no guide", () => {
    const far = frame(0.2, 0.2, 0.2, 0.2);
    const result = snap(far);
    expect(result.guides).toEqual({});
    expect(result.frame).toEqual(far);
  });

  it("honours the tolerance it is given", () => {
    expect(snap(frame(0.011, 0.3, 0.2, 0.1)).guides).toEqual({ x: 0 });
    expect(
      snap(frame(0.011, 0.3, 0.2, 0.1), [0, 0.5, 1], 0.005).guides,
    ).toEqual({});
  });

  it("takes the nearest candidate: the middle on 0.5 beats edges 0.01 from 0 and 1", () => {
    const result = snap(frame(0.01, 0.3, 0.98, 0.1));
    expect(result.guides).toEqual({ x: 0.5 });
    expectFrame(result.frame, frame(0.01, 0.3, 0.98, 0.1));
  });

  it("takes other guides", () => {
    expect(snap(frame(0.32, 0.1, 0.1, 0.1), [0.25, 0.75]).guides).toEqual({});
    expect(snap(frame(0.245, 0.1, 0.1, 0.1), [0.25, 0.75]).guides).toEqual({
      x: 0.25,
    });
  });
});

describe("snapDrawn", () => {
  // A logo's frame is 0.5 wide, and its mark (0.32 wide) is drawn at the left of it.
  const frameAt = (x: number, y = 0.3) => frame(x, y, 0.5, 0.1);
  const markAt = (x: number, y = 0.3) => frame(x, y, 0.32, 0.1);

  it("meets a guide with the box that is drawn, and moves the frame by the same correction", () => {
    // the mark's middle is at 0.505 (0.345 + 0.16)
    const result = snapDrawn(frameAt(0.345), markAt(0.345));
    expect(result.guides).toEqual({ x: 0.5 });
    expect(result.frame.x).toBeCloseTo(0.34, 9);
    expect(result.frame.y).toBe(0.3);
    expect(result.frame.w).toBe(0.5);
    // the mark is now on the guide: it is the frame that is off it
    expect(0.34 + 0.32 / 2).toBeCloseTo(0.5, 9);
    expect(middleX(result.frame)).not.toBeCloseTo(0.5, 2);
  });

  it("does not snap to the middle of an empty frame", () => {
    // the frame's middle is on 0.5, the mark's (0.41) is not
    const result = snapDrawn(frameAt(0.25), markAt(0.25));
    expect(result.guides).toEqual({});
    expect(result.frame).toEqual(frameAt(0.25));
  });

  it("puts the right edge of the mark, not of its frame, on the edge of the cover", () => {
    // the mark's right edge is at 0.995 (0.675 + 0.32); the frame's reaches 1.175
    const result = snapDrawn(frameAt(0.675), markAt(0.675));
    expect(result.guides).toEqual({ x: 1 });
    expect(result.frame.x).toBeCloseTo(0.68, 9);
  });

  it("snaps up and down by the box that is drawn too", () => {
    // a chip drawn a quarter of the way down its frame: its middle is on 0.5, the frame's is not
    const result = snapDrawn(
      frame(0.1, 0.45, 0.2, 0.4),
      frame(0.1, 0.45, 0.2, 0.1),
    );
    expect(result.guides).toEqual({ y: 0.5 });
    expectFrame(result.frame, frame(0.1, 0.45, 0.2, 0.4));
    const near = snapDrawn(
      frame(0.1, 0.452, 0.2, 0.4),
      frame(0.1, 0.452, 0.2, 0.1),
    );
    expect(near.guides).toEqual({ y: 0.5 });
    expect(near.frame.y).toBeCloseTo(0.45, 9);
    expect(near.frame.h).toBe(0.4);
  });

  it("is snap for a layer drawn as big as its frame, with its guides and tolerance", () => {
    const f = frame(0.305, 0.1, 0.4, 0.2);
    for (const [guides, tolerance] of [
      [undefined, undefined],
      [[0.25, 0.75], 0.02],
    ] as const) {
      const same = snapDrawn(f, f, guides, tolerance);
      const plain = snap(f, guides, tolerance);
      expect(same.guides).toEqual(plain.guides);
      expectFrame(same.frame, plain.frame);
    }
    // and the tolerance reaches it: 0.005 off the guide is out of 0.004
    const out = snapDrawn(frameAt(0.345), markAt(0.345), [0, 0.5, 1], 0.004);
    expect(out.guides).toEqual({});
  });
});

describe("hitTest", () => {
  const frames = {
    panel: frame(0, 0, 1, 1),
    photo: frame(0, 0, 0.5, 1),
    title: frame(0.1, 0.4, 0.3, 0.2),
    x1: frame(0.2, 0.45, 0.1, 0.1),
  };
  const order = ["panel", "photo", "label", "title", "x1"];

  it("returns the top-most frame under the point", () => {
    expect(hitTest(frames, 0.25, 0.5, order)).toBe("x1");
    expect(hitTest(frames, 0.12, 0.5, order)).toBe("title");
    expect(hitTest(frames, 0.12, 0.9, order)).toBe("photo");
    expect(hitTest(frames, 0.9, 0.9, order)).toBe("panel");
  });

  it("follows the order it is given, not the order of the frames", () => {
    expect(hitTest(frames, 0.25, 0.5, ["panel", "photo", "x1", "title"])).toBe(
      "title",
    );
  });

  it("skips a layer that has no frame, and finds nothing outside every frame", () => {
    expect(hitTest(frames, 0.12, 0.5, ["panel", "label", "logo"])).toBe(
      "panel",
    );
    expect(hitTest({ title: frames.title }, 0.9, 0.9, order)).toBeNull();
    expect(hitTest({}, 0.5, 0.5, order)).toBeNull();
  });

  it("counts the edges of a frame, and ignores a layer that is not in the order", () => {
    expect(hitTest(frames, 0.1, 0.4, order)).toBe("title");
    expect(hitTest(frames, 0.4, 0.6, order)).toBe("title");
    expect(hitTest({ ghost: frame(0, 0, 1, 1) }, 0.5, 0.5, order)).toBeNull();
  });
});

describe("panFocus", () => {
  // A 16:9 photo in a square 400 px frame covers it by height: 711 px wide, 311 px of it past the
  // frame, and nothing past it up and down.
  const frameSize = { w: 400, h: 400 };
  const image = { w: 1600, h: 900 };
  const overflow = (400 * 16) / 9 - 400;

  it("moves the picture as far as the pointer goes", () => {
    const [x, y] = panFocus([0.5, 0.5], [100, 40], frameSize, image, 1);
    // dragging right shows more of the left side: the focus goes down by 100 / 311
    expect(x).toBeCloseTo(0.5 - 100 / overflow, 9);
    expect(y).toBe(0.5);
  });

  it("moves slower in a zoomed photo", () => {
    const [x] = panFocus([0.5, 0.5], [100, 0], frameSize, image, 2);
    expect(x).toBeCloseTo(0.5 - 100 / ((2 - 1) * 400 + 2 * overflow), 9);
  });

  it("stays between 0 and 1", () => {
    expect(panFocus([0.1, 0.5], [900, 0], frameSize, image, 1)[0]).toBe(0);
    expect(panFocus([0.9, 0.5], [-900, 0], frameSize, image, 1)[0]).toBe(1);
  });

  it("does not move a photo that has nowhere to go, or one that has not loaded", () => {
    expect(panFocus([0.3, 0.7], [50, 50], frameSize, null, 1)).toEqual([
      0.3, 0.7,
    ]);
    expect(
      panFocus([0.3, 0.7], [50, 50], { w: 400, h: 225 }, image, 1),
    ).toEqual([0.3, 0.7]);
  });
});
