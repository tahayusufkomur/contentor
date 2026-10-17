import { describe, expect, it } from "vitest";
import {
  LAYOUTS,
  LEADING,
  aspectClass,
  fitLines,
  layoutFrames,
  textSize,
} from "@/lib/covers/layouts";
import type { ShownWords } from "@/lib/covers/layouts";
import type { Frame, LayoutId, PartId } from "@/types/design";

/** The aspects the brief names. */
const BRIEF = [0.75, 1, 1.333, 1.778, 3];
/** The Card aspects a look can have, Wide and Banner: every shape a cover is drawn in. */
const REAL = [3 / 4, 4 / 5, 1, 4 / 3, 3 / 2, 16 / 10, 16 / 9, 3];
/** The edges of the shape classes, and shapes wider than any cover is drawn in. */
const EDGES = [0.6, 0.94, 0.95, 1.19, 1.2, 2.39, 2.4, 3.6];
/** Every shape from 0.4 to 5 in steps of 0.05: the range the frames are meant to hold in. */
const SWEEP = Array.from({ length: 93 }, (_, i) => 0.4 + i * 0.05);
const SHAPES = [...BRIEF, ...REAL, ...EDGES, ...SWEEP];
/** Every mix of words a recipe can have. */
const SHOWN: ShownWords[] = [
  {},
  { label: false },
  { subtitle: false },
  { label: false, subtitle: false },
];
const CASES = LAYOUTS.flatMap((layout) =>
  SHAPES.flatMap((aspect) => SHOWN.map((shown) => ({ layout, aspect, shown }))),
);
const WORDS = ["label", "title", "subtitle"] as const;
const EPS = 1e-9;

const inside = (f: Frame) =>
  f.w > 0 &&
  f.h > 0 &&
  f.x >= -EPS &&
  f.y >= -EPS &&
  f.x + f.w <= 1 + EPS &&
  f.y + f.h <= 1 + EPS;
const meet = (a: Frame, b: Frame) =>
  a.x < b.x + b.w - EPS &&
  b.x < a.x + a.w - EPS &&
  a.y < b.y + b.h - EPS &&
  b.y < a.y + a.h - EPS;
const within = (inner: Frame, outer: Frame) =>
  inner.x >= outer.x - EPS &&
  inner.y >= outer.y - EPS &&
  inner.x + inner.w <= outer.x + outer.w + EPS &&
  inner.y + inner.h <= outer.y + outer.h + EPS;
const same = (actual: Frame | null, expected: Frame) => {
  for (const side of ["x", "y", "w", "h"] as const) {
    expect(actual![side]).toBeCloseTo(expected[side], 9);
  }
};
const label = (layout: LayoutId, aspect: number, shown: ShownWords = {}) =>
  `${layout} ${aspect.toFixed(3)} ${JSON.stringify(shown)}`;
/** A canvas is 100 cqmin on its shorter side. */
const canvasHeight = (aspect: number) => 100 / Math.min(1, aspect);

describe("aspectClass", () => {
  it("cuts at 0.95, 1.2 and 2.4", () => {
    expect(aspectClass(0.75)).toBe("portrait");
    expect(aspectClass(0.9499)).toBe("portrait");
    expect(aspectClass(0.95)).toBe("square");
    expect(aspectClass(1)).toBe("square");
    expect(aspectClass(1.1999)).toBe("square");
    expect(aspectClass(1.2)).toBe("landscape");
    expect(aspectClass(16 / 9)).toBe("landscape");
    expect(aspectClass(2.3999)).toBe("landscape");
    expect(aspectClass(2.4)).toBe("banner");
    expect(aspectClass(3)).toBe("banner");
  });
});

describe("LAYOUTS", () => {
  it("lists the six layouts", () => {
    expect([...LAYOUTS]).toEqual([
      "panel",
      "full",
      "title",
      "band",
      "framed",
      "photo",
    ]);
  });
});

describe("layoutFrames", () => {
  it("keeps every frame inside the canvas, in every layout, shape and mix of words", () => {
    for (const { layout, aspect, shown } of CASES) {
      for (const [part, frame] of Object.entries(
        layoutFrames(layout, aspect, shown),
      )) {
        if (frame) {
          expect(inside(frame), `${label(layout, aspect, shown)} ${part}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("draws what each layout is made of, and nothing else", () => {
    const parts = (layout: LayoutId) =>
      Object.entries(layoutFrames(layout, 4 / 3))
        .filter(([, frame]) => frame !== null)
        .map(([part]) => part as PartId);
    expect(parts("panel").sort()).toEqual(
      ["badge", "label", "logo", "panel", "photo", "subtitle", "title"].sort(),
    );
    // Full has no panel: CoverArt darkens the photo instead.
    expect(parts("full").sort()).toEqual(
      ["badge", "label", "logo", "photo", "subtitle", "title"].sort(),
    );
    // Title-only has no photo.
    expect(parts("title").sort()).toEqual(
      ["badge", "label", "logo", "panel", "subtitle", "title"].sort(),
    );
    expect(parts("band").sort()).toEqual(parts("panel").sort());
    expect(parts("framed").sort()).toEqual(parts("panel").sort());
    // A photo-only cover has no panel and no words.
    expect(parts("photo").sort()).toEqual(["badge", "logo", "photo"]);
  });

  it("fills the canvas with the photo or the colour where the layout says so", () => {
    const whole = { x: 0, y: 0, w: 1, h: 1 };
    for (const aspect of SHAPES) {
      same(layoutFrames("full", aspect).photo, whole);
      same(layoutFrames("photo", aspect).photo, whole);
      same(layoutFrames("title", aspect).panel, whole);
      same(layoutFrames("framed", aspect).panel, whole);
      // The band sits over a photo that runs underneath it.
      same(layoutFrames("band", aspect).photo, whole);
    }
  });

  it("puts the photo on one side of the panel and the words on the other", () => {
    for (const aspect of SHAPES) {
      const { photo, panel } = layoutFrames("panel", aspect);
      const cls = aspectClass(aspect);
      if (cls === "portrait" || cls === "square") {
        // Photo on top, panel under it.
        expect(photo!.y).toBe(0);
        expect(panel!.y).toBeCloseTo(photo!.h, 9);
        expect(photo!.w).toBe(1);
        expect(panel!.w).toBe(1);
      } else {
        // Panel on the left, photo on the right.
        expect(panel!.x).toBe(0);
        expect(photo!.x).toBeCloseTo(panel!.w, 9);
        expect(photo!.h).toBe(1);
        expect(panel!.h).toBe(1);
      }
    }
  });

  it("keeps the words clear of the photo in panel and framed", () => {
    for (const { layout, aspect, shown } of CASES) {
      if (layout !== "panel" && layout !== "framed") continue;
      const frames = layoutFrames(layout, aspect, shown);
      for (const word of WORDS) {
        if (!frames[word]) continue;
        expect(
          meet(frames[word]!, frames.photo!),
          `${label(layout, aspect, shown)} ${word}`,
        ).toBe(false);
      }
    }
  });

  it("holds the words on the colour: inside the panel, band or field", () => {
    for (const { layout, aspect, shown } of CASES) {
      if (!["panel", "band", "framed", "title"].includes(layout)) continue;
      const frames = layoutFrames(layout, aspect, shown);
      for (const word of WORDS) {
        if (!frames[word]) continue;
        expect(
          within(frames[word]!, frames.panel!),
          `${label(layout, aspect, shown)} ${word}`,
        ).toBe(true);
      }
    }
  });

  it("gives the banner photo at least 60% of the panel layout", () => {
    expect(layoutFrames("panel", 3).photo!.w).toBeGreaterThanOrEqual(0.6);
    expect(layoutFrames("panel", 2.4).photo!.w).toBeGreaterThanOrEqual(0.6);
  });

  it("makes the band the bottom 34%, or the left 38% in a banner", () => {
    for (const aspect of [0.75, 4 / 5, 1, 4 / 3, 3 / 2, 16 / 10, 16 / 9]) {
      same(layoutFrames("band", aspect).panel, {
        x: 0,
        y: 0.66,
        w: 1,
        h: 0.34,
      });
    }
    same(layoutFrames("band", 3).panel, { x: 0, y: 0, w: 0.38, h: 1 });
  });

  it("lets the band grow only when a frame is too wide for its words", () => {
    // 2.39 is wider than any cover is drawn in: the words would not fit 34%.
    expect(layoutFrames("band", 2.39).panel!.h).toBeGreaterThan(0.34);
  });

  it("puts the words of a full photo at the bottom left, under the logo", () => {
    for (const aspect of REAL) {
      const { label, title, subtitle, logo } = layoutFrames("full", aspect);
      expect(label!.x).toBeLessThan(0.1);
      expect(subtitle!.y + subtitle!.h).toBeGreaterThan(0.9);
      expect(title!.y).toBeGreaterThan(logo!.y + logo!.h);
    }
  });

  it("insets the framed photo from the edges of the colour field", () => {
    for (const aspect of REAL) {
      const { photo } = layoutFrames("framed", aspect);
      expect(photo!.x).toBeGreaterThan(0);
      expect(photo!.y).toBeGreaterThan(0);
      expect(photo!.x + photo!.w).toBeLessThan(1);
      expect(photo!.y + photo!.h).toBeLessThan(1);
    }
  });

  it("stacks label, title and subtitle top to bottom without touching", () => {
    for (const { layout, aspect, shown } of CASES) {
      const frames = layoutFrames(layout, aspect, shown);
      const present = WORDS.map((word) => frames[word]).filter(
        (frame): frame is Frame => frame !== null,
      );
      present.forEach((frame, i) => {
        const next = present[i + 1];
        if (!next) return;
        expect(meet(frame, next), label(layout, aspect, shown)).toBe(false);
        expect(
          frame.y + frame.h,
          label(layout, aspect, shown),
        ).toBeLessThanOrEqual(next.y + EPS);
      });
    }
  });

  it("keeps the logo and badge off the words and off each other", () => {
    for (const { layout, aspect, shown } of CASES) {
      const frames = layoutFrames(layout, aspect, shown);
      const here = label(layout, aspect, shown);
      for (const word of WORDS) {
        if (!frames[word]) continue;
        expect(meet(frames.logo!, frames[word]!), `${here} logo/${word}`).toBe(
          false,
        );
        expect(
          meet(frames.badge!, frames[word]!),
          `${here} badge/${word}`,
        ).toBe(false);
      }
      expect(meet(frames.logo!, frames.badge!), `${here} logo/badge`).toBe(
        false,
      );
    }
  });

  it("draws no words in photo-only, and no photo in title-only", () => {
    for (const aspect of REAL) {
      const photoOnly = layoutFrames("photo", aspect);
      for (const word of WORDS) expect(photoOnly[word]).toBeNull();
      expect(photoOnly.panel).toBeNull();
      expect(layoutFrames("title", aspect).photo).toBeNull();
    }
  });

  it("centres the words of a title-only cover and the logo above them", () => {
    for (const aspect of REAL) {
      const frames = layoutFrames("title", aspect);
      const centre = (f: Frame) => f.x + f.w / 2;
      for (const word of WORDS) {
        expect(centre(frames[word]!), word).toBeCloseTo(0.5, 9);
      }
      expect(centre(frames.logo!)).toBeCloseTo(0.5, 9);
    }
  });

  it("leaves a word out when it is not drawn, and closes the gap", () => {
    // Bottom-anchored: dropping the subtitle lets the title drop to the bottom.
    const all = layoutFrames("panel", 3 / 4);
    const noSubtitle = layoutFrames("panel", 3 / 4, { subtitle: false });
    expect(noSubtitle.subtitle).toBeNull();
    expect(noSubtitle.title!.y).toBeGreaterThan(all.title!.y);
    expect(noSubtitle.title!.y + noSubtitle.title!.h).toBeGreaterThan(
      all.title!.y + all.title!.h,
    );
    // Dropping the label leaves the title where it was.
    const noLabel = layoutFrames("panel", 3 / 4, { label: false });
    expect(noLabel.label).toBeNull();
    same(noLabel.title, all.title!);
    // Nothing but a title: it takes the bottom of the stack.
    const titleOnly = layoutFrames("panel", 3 / 4, {
      label: false,
      subtitle: false,
    });
    expect(titleOnly.title!.y + titleOnly.title!.h).toBeCloseTo(
      all.subtitle!.y + all.subtitle!.h,
      9,
    );
    // A hidden title leaves the others.
    expect(layoutFrames("panel", 1, { title: false }).title).toBeNull();
    expect(layoutFrames("panel", 1, { title: false }).subtitle).not.toBeNull();
    // Nothing at all: no words.
    const bare = layoutFrames("panel", 1, {
      label: false,
      title: false,
      subtitle: false,
    });
    for (const word of WORDS) expect(bare[word]).toBeNull();
    // Centred stacks stay centred.
    const mid = layoutFrames("title", 1, { label: false, subtitle: false });
    expect(mid.title!.y + mid.title!.h / 2).toBeGreaterThan(0.4);
    expect(mid.title!.y + mid.title!.h / 2).toBeLessThan(0.6);
  });
});

describe("textSize", () => {
  it("makes a title readable at a 300 px wide frame: at least 16 px", () => {
    for (const layout of LAYOUTS) {
      for (const aspect of [...BRIEF, ...SHAPES]) {
        const px =
          (textSize(layout, "title", aspect) * Math.min(300, 300 / aspect)) /
          100;
        expect(px, `${layout} ${aspect.toFixed(3)}`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("sizes the other words and the badge relative to the title", () => {
    for (const layout of LAYOUTS) {
      for (const aspect of BRIEF) {
        const title = textSize(layout, "title", aspect);
        expect(textSize(layout, "label", aspect)).toBeLessThan(title);
        expect(textSize(layout, "subtitle", aspect)).toBeLessThan(title);
        expect(textSize(layout, "subtitle", aspect)).toBeGreaterThan(
          textSize(layout, "label", aspect),
        );
        expect(textSize(layout, "badge", aspect)).toBeGreaterThan(0);
      }
    }
  });

  it("makes the title-only layout's title the biggest", () => {
    for (const aspect of [0.75, 1, 4 / 3]) {
      expect(textSize("title", "title", aspect)).toBeGreaterThan(
        textSize("panel", "title", aspect),
      );
    }
  });
});

describe("fitLines", () => {
  const lines = (
    layout: LayoutId,
    aspect: number,
    word: (typeof WORDS)[number],
    shown: ShownWords = {},
  ) =>
    fitLines(
      layoutFrames(layout, aspect, shown)[word]!,
      aspect,
      textSize(layout, word, aspect),
      LEADING[word],
    );

  it("is exactly the lines each frame was sized for, so a clamp never cuts a line", () => {
    for (const { layout, aspect, shown } of CASES) {
      if (layout === "photo") continue;
      const frames = layoutFrames(layout, aspect, shown);
      for (const word of WORDS) {
        const frame = frames[word];
        if (!frame) continue;
        const n = fitLines(
          frame,
          aspect,
          textSize(layout, word, aspect),
          LEADING[word],
        );
        expect(
          frame.h * canvasHeight(aspect),
          `${label(layout, aspect, shown)} ${word}`,
        ).toBeCloseTo(n * textSize(layout, word, aspect) * LEADING[word], 6);
      }
    }
  });

  it("gives the label one line", () => {
    for (const layout of LAYOUTS.filter((l) => l !== "photo")) {
      for (const aspect of REAL) expect(lines(layout, aspect, "label")).toBe(1);
    }
  });

  it("holds the title to the lines its layout gives it", () => {
    expect(lines("panel", 3 / 4, "title")).toBe(2);
    expect(
      lines("panel", 3 / 4, "title", { label: false, subtitle: false }),
    ).toBe(2);
    expect(lines("panel", 4 / 3, "title")).toBe(3);
    expect(lines("full", 1, "title")).toBe(3);
    expect(lines("panel", 3, "title")).toBeGreaterThanOrEqual(2);
  });

  it("gives the band's title the room the other words leave it", () => {
    // The 34% band holds a one-line title with a label and a subtitle, two lines alone.
    for (const aspect of [1, 4 / 3, 16 / 9]) {
      expect(lines("band", aspect, "title")).toBe(1);
      expect(
        lines("band", aspect, "title", { label: false, subtitle: false }),
      ).toBe(2);
    }
  });

  it("follows a frame she resizes", () => {
    const frame = layoutFrames("panel", 4 / 3).title!;
    const size = textSize("panel", "title", 4 / 3);
    const base = fitLines(frame, 4 / 3, size, LEADING.title);
    expect(
      fitLines({ ...frame, h: frame.h * 2 }, 4 / 3, size, LEADING.title),
    ).toBe(base * 2);
    // Bigger text, or taller lines, fit fewer.
    expect(fitLines(frame, 4 / 3, size * 2, LEADING.title)).toBeLessThan(base);
    expect(fitLines(frame, 4 / 3, size, LEADING.title * 2)).toBeLessThan(base);
    // Never fewer than one, whatever the frame.
    expect(fitLines({ ...frame, h: 0.001 }, 4 / 3, size, LEADING.title)).toBe(
      1,
    );
  });
});
