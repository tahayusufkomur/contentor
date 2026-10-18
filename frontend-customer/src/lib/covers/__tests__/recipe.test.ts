import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CoverAspect } from "@shared/sections/types";
import { layoutFrames } from "@/lib/covers/layouts";
import {
  RANGES,
  SIZES,
  badgeKindsFor,
  defaultRecipe,
  fromSet,
  framesFor,
  layerOrder,
  nearestGenerationAspect,
  nearestSize,
  resolveWords,
  sizeAspect,
} from "@/lib/covers/recipe";
import {
  BADGE_KINDS,
  FONT_ROLES,
  LAYOUTS,
  MAX_EXTRAS,
  PAINT_ROLES,
  PARTS,
  SHAPES,
  TEXT_MAX,
  WEIGHTS,
} from "@/types/design";
import type { CoverRecipe, Frame } from "@/types/design";

const CARDS: CoverAspect[] = ["3/4", "4/5", "1/1", "4/3", "3/2", "16/10"];
const DAY = 86_400_000;
const recipeWith = (patch: Partial<CoverRecipe>): CoverRecipe => ({
  ...defaultRecipe({}),
  ...patch,
});
const frame = (x: number, y: number, w: number, h: number): Frame => ({
  x,
  y,
  w,
  h,
});

describe("the recipe matches the backend validator", () => {
  // The backend lives outside this package: present on a developer's machine
  // and in the repo checkout, absent inside the frontend container.
  const source = path.resolve(
    __dirname,
    "../../../../../backend/apps/media/design_recipe.py",
  );
  const python = existsSync(source) ? readFileSync(source, "utf8") : "";
  const tuple = (name: string) =>
    [
      ...(
        new RegExp(`^${name} = \\(([^)]*)\\)`, "m").exec(python)?.[1] ?? ""
      ).matchAll(/"([^"]+)"|(\d+)/g),
    ].map((m) => (m[1] !== undefined ? m[1] : Number(m[2])));

  it.skipIf(!existsSync(source))("has the same constants", () => {
    expect(tuple("LAYOUTS")).toEqual([...LAYOUTS]);
    expect(tuple("SIZES")).toEqual([...SIZES]);
    expect(tuple("PARTS")).toEqual([...PARTS]);
    expect(tuple("BADGE_KINDS")).toEqual([...BADGE_KINDS]);
    expect(tuple("FONT_ROLES")).toEqual([...FONT_ROLES]);
    expect(tuple("PAINT_ROLES")).toEqual([...PAINT_ROLES]);
    expect(tuple("SHAPES")).toEqual([...SHAPES]);
    expect(tuple("WEIGHTS")).toEqual([...WEIGHTS]);
    expect(Number(/^MAX_EXTRAS = (\d+)/m.exec(python)?.[1])).toBe(MAX_EXTRAS);
    const limits = Object.fromEntries(
      [
        ...(/^TEXT_MAX = \{([^}]*)\}/m.exec(python)?.[1] ?? "").matchAll(
          /"(\w+)": (\d+)/g,
        ),
      ].map((m) => [m[1], Number(m[2])]),
    );
    expect(limits).toEqual(TEXT_MAX);
  });

  it.skipIf(!existsSync(source))("has the same clamp ranges", () => {
    const pair = (lo: string, hi: string) => [Number(lo), Number(hi)];
    // `_STYLE_RANGES = {"scale": (0.5, 2), ...}`
    const table = (name: string) =>
      Object.fromEntries(
        [
          ...(
            new RegExp(`^${name} = \\{([^}]*)\\}`, "m").exec(python)?.[1] ?? ""
          ).matchAll(/"(\w+)": \((-?[\d.]+), (-?[\d.]+)\)/g),
        ].map((m) => [m[1], pair(m[2], m[3])]),
      );
    // `_clamp(photo.get("zoom"), 1, 3, 1)`: the two numbers after the value
    const clamp = (value: string) => {
      const m = new RegExp(
        `_clamp\\(${value}, (-?[\\d.]+), (-?[\\d.]+), `,
      ).exec(python);
      return m ? pair(m[1], m[2]) : null;
    };
    expect({
      ...table("_STYLE_RANGES"),
      frame: table("_FRAME_RANGES"),
      focus: clamp("axis"),
      zoom: clamp('photo\\.get\\("zoom"\\)'),
      brightness: clamp('photo\\.get\\("brightness"\\)'),
      contrast: clamp('photo\\.get\\("contrast"\\)'),
      saturation: clamp('photo\\.get\\("saturation"\\)'),
      darken: clamp('photo\\.get\\("darken"\\)'),
      opacity: clamp('raw\\.get\\("opacity"\\)'),
    }).toEqual(RANGES);
  });

  it("keeps every range ordered, and the defaults inside them", () => {
    const flat = Object.values({ ...RANGES, ...RANGES.frame });
    for (const range of flat) {
      if (Array.isArray(range)) expect(range[0]).toBeLessThan(range[1]);
    }
    const { photo } = defaultRecipe();
    for (const key of [
      "zoom",
      "brightness",
      "contrast",
      "saturation",
      "darken",
    ] as const) {
      expect(photo[key]).toBeGreaterThanOrEqual(RANGES[key][0]);
      expect(photo[key]).toBeLessThanOrEqual(RANGES[key][1]);
    }
  });
});

describe("defaultRecipe", () => {
  it("is the contract's default recipe", () => {
    expect(defaultRecipe({})).toEqual({
      version: 1,
      layout: "panel",
      photo: {
        id: null,
        focus: [0.5, 0.5],
        zoom: 1,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        darken: 0,
      },
      words: { label: "", title: null, subtitle: "" },
      badge: { kind: "none", text: "", fill: "accent" },
      logo: true,
      panel: "primary",
      styles: {},
      extras: [],
      overrides: {},
    });
    expect(defaultRecipe()).toEqual(defaultRecipe({}));
  });

  it("hands out a fresh recipe each time", () => {
    const first = defaultRecipe({});
    first.photo.focus[0] = 0;
    first.styles.title = { scale: 2 };
    first.extras.push({
      id: "x1",
      type: "shape",
      shape: "rect",
      fill: "accent",
      opacity: 1,
      frame: frame(0, 0, 0.1, 0.1),
    });
    expect(defaultRecipe({})).toEqual(defaultRecipe());
    expect(defaultRecipe({}).photo.focus).toEqual([0.5, 0.5]);
    expect(defaultRecipe({}).styles).toEqual({});
    expect(defaultRecipe({}).extras).toEqual([]);
  });

  it("takes a layout and a photo", () => {
    const recipe = defaultRecipe({ layout: "band", photoId: "p-1" });
    expect(recipe.layout).toBe("band");
    expect(recipe.photo.id).toBe("p-1");
    expect(defaultRecipe({ photoId: null }).photo.id).toBeNull();
  });

  it("starts from her set: its layout and colours, with the new item's words and photo", () => {
    const kept: CoverRecipe = {
      ...defaultRecipe({ layout: "framed", photoId: "old-photo" }),
      words: { label: "Old", title: "Old title", subtitle: "Old subtitle" },
      badge: { kind: "text", text: "Sold out", fill: "#1E5AA8" },
      logo: false,
      panel: "accent-dark",
      styles: { title: { upper: true, color: "white" } },
    };
    const recipe = defaultRecipe({ set: kept, photoId: "new-photo" });
    expect(recipe.layout).toBe("framed");
    expect(recipe.panel).toBe("accent-dark");
    expect(recipe.badge).toEqual(kept.badge);
    expect(recipe.logo).toBe(false);
    expect(recipe.styles).toEqual(kept.styles);
    expect(recipe.words).toEqual({ label: "", title: null, subtitle: "" });
    expect(recipe.photo.id).toBe("new-photo");
    // An explicit layout beats the set's.
    expect(defaultRecipe({ set: kept, layout: "title" }).layout).toBe("title");
    // A null set is no set.
    expect(defaultRecipe({ set: null })).toEqual(defaultRecipe({}));
  });
});

describe("fromSet", () => {
  const kept: CoverRecipe = {
    ...defaultRecipe({ layout: "band", photoId: "p" }),
    words: { label: "L", title: "T", subtitle: "S" },
    panel: "inverse",
    badge: { kind: "new", text: "", fill: "primary" },
    logo: false,
    styles: { subtitle: { align: "right" } },
    extras: [
      {
        id: "e1",
        type: "badge",
        text: "Hi",
        fill: "accent",
        frame: frame(0.1, 0.1, 0.2, 0.1),
      },
    ],
    overrides: { card: { title: frame(0, 0, 1, 1) } },
  };

  it("keeps the layout and the colours and styles, not the words, photo, extras or frames", () => {
    const set = fromSet(kept);
    expect(Object.keys(set).sort()).toEqual([
      "badge",
      "layout",
      "logo",
      "panel",
      "styles",
    ]);
    expect(set).toEqual({
      layout: "band",
      panel: "inverse",
      badge: kept.badge,
      logo: false,
      styles: { subtitle: { align: "right" } },
    });
  });

  it("copies, so editing the new recipe never touches the kept one", () => {
    const set = fromSet(kept);
    set.styles.subtitle!.align = "left";
    set.badge.text = "changed";
    expect(kept.styles.subtitle!.align).toBe("right");
    expect(kept.badge.text).toBe("");
  });
});

describe("sizes", () => {
  it("lists card, wide and banner", () => {
    expect([...SIZES]).toEqual(["card", "wide", "banner"]);
  });

  it("gives each size its aspect: the look's for card, 16/9 and 3 for the others", () => {
    expect(sizeAspect("card", "4/3")).toBeCloseTo(4 / 3, 9);
    expect(sizeAspect("card", "3/4")).toBeCloseTo(0.75, 9);
    expect(sizeAspect("card", "16/10")).toBeCloseTo(1.6, 9);
    expect(sizeAspect("wide", "3/4")).toBeCloseTo(16 / 9, 9);
    expect(sizeAspect("banner", "3/4")).toBe(3);
  });

  it("picks the size nearest a frame's aspect ratio", () => {
    expect(nearestSize(1.33, "4/3")).toBe("card");
    expect(nearestSize(2, "4/3")).toBe("wide");
    expect(nearestSize(3.5, "4/3")).toBe("banner");
  });

  it("compares ratios, not differences: the middle is the geometric mean", () => {
    // Between 4/3 and 16/9 the cut is their geometric mean, about 1.54 (the arithmetic mean is 1.56).
    expect(nearestSize(1.53, "4/3")).toBe("card");
    expect(nearestSize(1.55, "4/3")).toBe("wide");
    // A tall card: a square frame is nearer to it than to Wide.
    expect(nearestSize(1, "3/4")).toBe("card");
    expect(nearestSize(0.3, "3/4")).toBe("card");
    expect(nearestSize(100, "3/4")).toBe("banner");
  });

  it("returns each size for its own aspect, whatever the card", () => {
    for (const card of CARDS) {
      for (const size of SIZES) {
        expect(nearestSize(sizeAspect(size, card), card)).toBe(size);
      }
    }
  });
});

describe("framesFor", () => {
  it("draws the layout's frames at that size's own aspect", () => {
    const recipe = recipeWith({
      layout: "panel",
      words: { label: "L", title: null, subtitle: "S" },
    });
    for (const [size, aspect] of [
      ["card", 4 / 3],
      ["wide", 16 / 9],
      ["banner", 3],
    ] as const) {
      const frames = framesFor(recipe, size, "4/3");
      const expected = layoutFrames("panel", aspect, {});
      for (const part of [
        "photo",
        "panel",
        "label",
        "title",
        "subtitle",
        "logo",
      ] as const) {
        expect(frames[part], `${size} ${part}`).toEqual(expected[part]);
      }
    }
  });

  it("makes room for the badge in a title-only cover only while a badge is drawn", () => {
    const none = framesFor(recipeWith({ layout: "title" }), "card", "3/4");
    const live = recipeWith({
      layout: "title",
      badge: { kind: "live", text: "", fill: "accent" },
    });
    const drawn = framesFor(live, "card", "3/4");
    expect(none.badge).toBeUndefined();
    expect(drawn.badge).toBeDefined();
    // The badge heads the stack, so the title sits lower than it does alone.
    expect(drawn.title.y).toBeGreaterThan(none.title.y);
    // A badge she removed takes no room either.
    const removed = framesFor(
      { ...live, styles: { badge: { hidden: true } } },
      "card",
      "3/4",
    );
    expect(removed.badge).toBeUndefined();
    expect(removed.title).toEqual(none.title);
  });

  it("follows the look's shape for card", () => {
    const portrait = framesFor(defaultRecipe({}), "card", "3/4");
    const landscape = framesFor(defaultRecipe({}), "card", "3/2");
    expect(portrait.photo).not.toEqual(landscape.photo);
  });

  it("adds her extras, each at its own frame", () => {
    const extra = frame(0.2, 0.3, 0.4, 0.1);
    const frames = framesFor(
      recipeWith({
        extras: [
          { id: "x1", type: "text", text: "Hello", style: {}, frame: extra },
        ],
      }),
      "wide",
      "4/3",
    );
    expect(frames.x1).toEqual(extra);
    expect(frames.title).toBeDefined();
  });

  it("lets an override replace the frame at its own size only", () => {
    const moved = frame(0.05, 0.05, 0.5, 0.2);
    const recipe = recipeWith({ overrides: { banner: { title: moved } } });
    expect(framesFor(recipe, "banner", "4/3").title).toEqual(moved);
    expect(framesFor(recipe, "card", "4/3").title).toEqual(
      framesFor(defaultRecipe({}), "card", "4/3").title,
    );
    expect(framesFor(recipe, "wide", "4/3").title).toEqual(
      framesFor(defaultRecipe({}), "wide", "4/3").title,
    );
    // The other layers of that size stay where the layout put them.
    expect(framesFor(recipe, "banner", "4/3").photo).toEqual(
      framesFor(defaultRecipe({}), "banner", "4/3").photo,
    );
  });

  it("lets an override move an extra", () => {
    const moved = frame(0.5, 0.5, 0.1, 0.1);
    const recipe = recipeWith({
      extras: [
        {
          id: "x1",
          type: "shape",
          shape: "circle",
          fill: "accent",
          opacity: 1,
          frame: frame(0, 0, 0.1, 0.1),
        },
      ],
      overrides: { card: { x1: moved } },
    });
    expect(framesFor(recipe, "card", "4/3").x1).toEqual(moved);
    expect(framesFor(recipe, "wide", "4/3").x1).toEqual(frame(0, 0, 0.1, 0.1));
  });

  it("leaves out what is not drawn: empty words, a removed part, no logo, no badge", () => {
    const base = framesFor(defaultRecipe({}), "card", "4/3");
    expect(base.label).toBeUndefined();
    expect(base.subtitle).toBeUndefined();
    expect(base.badge).toBeUndefined();
    expect(base.title).toBeDefined();
    expect(base.logo).toBeDefined();

    const spaces = framesFor(
      recipeWith({ words: { label: "  ", title: null, subtitle: "" } }),
      "card",
      "4/3",
    );
    expect(spaces.label).toBeUndefined();

    const words = framesFor(
      recipeWith({ words: { label: "L", title: null, subtitle: "S" } }),
      "card",
      "4/3",
    );
    expect(words.label).toBeDefined();
    expect(words.subtitle).toBeDefined();

    const removed = framesFor(
      recipeWith({
        styles: { title: { hidden: true }, photo: { hidden: true } },
      }),
      "card",
      "4/3",
    );
    expect(removed.title).toBeUndefined();
    expect(removed.photo).toBeUndefined();
    expect(removed.panel).toBeDefined();

    expect(
      framesFor(recipeWith({ logo: false }), "card", "4/3").logo,
    ).toBeUndefined();
    expect(
      framesFor(
        recipeWith({ styles: { logo: { hidden: true } } }),
        "card",
        "4/3",
      ).logo,
    ).toBeUndefined();
    expect(
      framesFor(
        recipeWith({ badge: { kind: "new", text: "", fill: "accent" } }),
        "card",
        "4/3",
      ).badge,
    ).toBeDefined();
  });

  it("ignores an override for a layer that is not drawn", () => {
    const stray = frame(0, 0, 0.1, 0.1);
    const recipe = recipeWith({
      styles: { title: { hidden: true } },
      overrides: { card: { title: stray, gone: stray, badge: stray } },
    });
    const frames = framesFor(recipe, "card", "4/3");
    expect(frames.title).toBeUndefined();
    expect(frames.gone).toBeUndefined();
    expect(frames.badge).toBeUndefined();
  });

  it("closes the gap a missing word leaves", () => {
    const withSubtitle = framesFor(
      recipeWith({ words: { label: "", title: null, subtitle: "A line" } }),
      "card",
      "3/4",
    );
    const titleOnly = framesFor(defaultRecipe({}), "card", "3/4");
    expect(titleOnly.title!.y).toBeGreaterThan(withSubtitle.title!.y);
  });
});

describe("layerOrder", () => {
  it("stacks panel, photo, label, title, subtitle, logo, badge, then her extras", () => {
    const recipe = recipeWith({
      extras: [
        {
          id: "a",
          type: "text",
          text: "A",
          style: {},
          frame: frame(0, 0, 0.1, 0.1),
        },
        {
          id: "b",
          type: "text",
          text: "B",
          style: {},
          frame: frame(0, 0, 0.1, 0.1),
        },
      ],
    });
    expect(layerOrder(recipe)).toEqual([
      "panel",
      "photo",
      "label",
      "title",
      "subtitle",
      "logo",
      "badge",
      "a",
      "b",
    ]);
  });

  it("puts the band over its photo", () => {
    expect(layerOrder(recipeWith({ layout: "band" })).slice(0, 2)).toEqual([
      "photo",
      "panel",
    ]);
    for (const layout of LAYOUTS.filter((l) => l !== "band")) {
      expect(layerOrder(recipeWith({ layout })).slice(0, 2)).toEqual([
        "panel",
        "photo",
      ]);
    }
  });
});

describe("badgeKindsFor", () => {
  it("leaves out the date for a course and New for an event", () => {
    expect(badgeKindsFor("course", "none")).toEqual([
      "none",
      "new",
      "live",
      "text",
    ]);
    for (const kind of ["live", "stream", "zoom", "onsite"]) {
      expect(badgeKindsFor(kind, "none")).toEqual([
        "none",
        "date",
        "live",
        "text",
      ]);
    }
  });

  it("keeps the kind a badge has, and offers every kind where the target is not known", () => {
    expect(badgeKindsFor("course", "date")).toContain("date");
    expect(badgeKindsFor("zoom", "new")).toContain("new");
    expect(badgeKindsFor(undefined, "none")).toEqual([...BADGE_KINDS]);
  });
});

describe("nearestGenerationAspect", () => {
  it("picks the generation shape closest to the card", () => {
    expect(nearestGenerationAspect("3/4")).toBe("4:5");
    expect(nearestGenerationAspect("16/10")).toBe("16:9");
    expect(nearestGenerationAspect("4/5")).toBe("4:5");
    expect(nearestGenerationAspect("1/1")).toBe("1:1");
    expect(nearestGenerationAspect("4/3")).toBe("4:3");
    expect(nearestGenerationAspect("3/2")).toBe("4:3");
  });
});

describe("resolveWords", () => {
  const now = new Date(2026, 9, 17, 12, 0, 0);
  const ago = (days: number) =>
    new Date(now.getTime() - days * DAY).toISOString();
  const badge = (kind: CoverRecipe["badge"]["kind"], text = "") =>
    recipeWith({ badge: { kind, text, fill: "accent" } });

  it("binds the title to the item's until she types her own", () => {
    const item = { title: "Morning Flow" };
    expect(resolveWords(defaultRecipe({}), item, now).title).toBe(
      "Morning Flow",
    );
    const typed = recipeWith({
      words: { label: "New", title: "My words", subtitle: "Sub" },
    });
    expect(resolveWords(typed, item, now)).toMatchObject({
      label: "New",
      title: "My words",
      subtitle: "Sub",
    });
    // Renaming the item moves a bound title and leaves a typed one.
    expect(
      resolveWords(defaultRecipe({}), { title: "Renamed" }, now).title,
    ).toBe("Renamed");
    expect(resolveWords(typed, { title: "Renamed" }, now).title).toBe(
      "My words",
    );
  });

  it("gives no badge for none, and her own words for text", () => {
    const item = { title: "T", createdAt: ago(1) };
    expect(resolveWords(badge("none"), item, now).badge).toBeNull();
    expect(resolveWords(badge("text", "Sold out"), item, now).badge).toBe(
      "Sold out",
    );
    expect(resolveWords(badge("text", ""), item, now).badge).toBeNull();
    expect(resolveWords(badge("text", "   "), item, now).badge).toBeNull();
    expect(resolveWords(badge("live"), item, now).badge).toBe("Live");
  });

  it("shows New for 30 days after the course was created", () => {
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: ago(0) }, now).badge,
    ).toBe("New");
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: ago(29) }, now).badge,
    ).toBe("New");
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: ago(30) }, now).badge,
    ).toBe("New");
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: ago(31) }, now).badge,
    ).toBeNull();
    expect(resolveWords(badge("new"), { title: "T" }, now).badge).toBeNull();
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: null }, now).badge,
    ).toBeNull();
    expect(
      resolveWords(badge("new"), { title: "T", createdAt: "not a date" }, now)
        .badge,
    ).toBeNull();
  });

  it("shows the next date as a short English date, and nothing once it has passed", () => {
    const at = (y: number, m: number, d: number) =>
      new Date(y, m, d, 18, 30).toISOString();
    expect(
      resolveWords(
        badge("date"),
        { title: "T", startsAt: at(2026, 10, 2) },
        now,
      ).badge,
    ).toBe("Nov 2");
    expect(
      resolveWords(
        badge("date"),
        { title: "T", startsAt: at(2026, 11, 25) },
        now,
      ).badge,
    ).toBe("Dec 25");
    expect(
      resolveWords(badge("date"), { title: "T", startsAt: at(2026, 8, 1) }, now)
        .badge,
    ).toBeNull();
    expect(
      resolveWords(
        badge("date"),
        { title: "T", startsAt: now.toISOString() },
        now,
      ).badge,
    ).not.toBeNull();
    expect(resolveWords(badge("date"), { title: "T" }, now).badge).toBeNull();
    expect(
      resolveWords(badge("date"), { title: "T", startsAt: null }, now).badge,
    ).toBeNull();
    expect(
      resolveWords(badge("date"), { title: "T", startsAt: "soon" }, now).badge,
    ).toBeNull();
  });

  it("reads the date in the item's time zone when it has one, else in the viewer's", () => {
    // 23:30 UTC on 2 November is the 3rd in Istanbul (UTC+3) and Auckland (UTC+13), still the 2nd in New York.
    const startsAt = "2026-11-02T23:30:00Z";
    const date = (timeZone?: string | null) =>
      resolveWords(badge("date"), { title: "T", startsAt, timeZone }, now)
        .badge;
    expect(date("Europe/Istanbul")).toBe("Nov 3");
    expect(date("Pacific/Auckland")).toBe("Nov 3");
    expect(date("America/New_York")).toBe("Nov 2");
    expect(date("UTC")).toBe("Nov 2");
    // No zone (or an empty one): the viewer's own, as before.
    const local = new Date(startsAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    expect(date()).toBe(local);
    expect(date(null)).toBe(local);
    expect(date("")).toBe(local);
  });
});
