import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoverArt } from "@/components/covers/cover-art";
import { LookFonts } from "@/components/covers/look-fonts";
import { fitLines, LEADING, textSize } from "@/lib/covers/layouts";
import { coverPalette, readableOn } from "@/lib/covers/palette";
import {
  defaultRecipe,
  framesFor,
  nearestSize,
  sizeAspect,
} from "@/lib/covers/recipe";
import { SITE_STYLES, styleFontsHref } from "@/lib/site-styles";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  Frame,
  Paint,
} from "@/types/design";

const PHOTO = "11111111-1111-4111-8111-111111111111";
const PHOTO_URL = "https://cdn.test/photo.jpg";
const LOGO_URL = "https://cdn.test/logo.png";
const ITEM: CoverItem = {
  title: "Morning flow",
  createdAt: "2026-10-01T00:00:00Z",
};
const NOW = new Date("2026-10-18T12:00:00Z");
const FRAME: Frame = { x: 0.1, y: 0.1, w: 0.5, h: 0.1 };
const WORDS = {
  label: "Course",
  title: null,
  subtitle: "Six weeks",
} satisfies CoverRecipe["words"];

/** A design on `look`, from the default recipe with her photo, edited by `edit`. */
function design(
  edit: (recipe: CoverRecipe) => void = () => {},
  look = "atelier",
  rest: Partial<CoverDesign> = {},
): CoverDesign {
  const recipe = defaultRecipe({ photoId: PHOTO });
  edit(recipe);
  return {
    id: "d1",
    recipe,
    photos: { [PHOTO]: PHOTO_URL },
    logo_url: LOGO_URL,
    look,
    ...rest,
  };
}

const draw = (
  d: CoverDesign,
  props: Partial<ComponentProps<typeof CoverArt>> = {},
) =>
  renderToStaticMarkup(
    createElement(CoverArt, { design: d, item: ITEM, now: NOW, ...props }),
  );

// The tests read the markup as a flat list of its opening tags, in order: no DOM library here.
interface El {
  tag: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
}
const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
function parse(markup: string): El[] {
  const tags = /<([a-z][a-z0-9]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g;
  return [...markup.matchAll(tags)].map(([, tag, raw]) => {
    const attrs = Object.fromEntries(
      [...raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [
        k,
        decode(v ?? ""),
      ]),
    );
    const style = Object.fromEntries(
      (attrs.style ?? "")
        .split(";")
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1)]),
    );
    return { tag, attrs, style };
  });
}
/** The tags inside one size's wrapper. */
function within(els: El[], size: CoverSize): El[] {
  const rest = els.slice(
    els.findIndex((e) => e.attrs["data-size"] === size) + 1,
  );
  const end = rest.findIndex((e) => "data-size" in e.attrs);
  return end < 0 ? rest : rest.slice(0, end);
}
const layer = (els: El[], id: string) =>
  els.find((e) => e.attrs["data-layer"] === id);
/** The tag right after `el`: the clamped text inside a word, the photo inside a photo layer. */
const after = (els: El[], el: El | undefined) => els[els.indexOf(el!) + 1];
const has = (e: El | undefined, attr: string) => Boolean(e) && attr in e!.attrs;
const clamp = (els: El[], id: string) =>
  Number(after(els, layer(els, id)).style["-webkit-line-clamp"]);
/** What the module says the lines of a word's frame are: its frame in the size, at its size. */
function lines(
  d: CoverDesign,
  size: CoverSize,
  part: "label" | "title" | "subtitle",
) {
  const { coverAspect } = SITE_STYLES[d.look];
  const aspect = sizeAspect(size, coverAspect);
  const frame = framesFor(d.recipe, size, coverAspect)[part];
  const fits = fitLines(
    frame,
    aspect,
    textSize(d.recipe.layout, part, aspect),
    LEADING[part],
  );
  return Math.min({ label: 1, title: 3, subtitle: 3 }[part], fits);
}

const css = readFileSync(
  path.resolve(__dirname, "..", "cover-art.module.css"),
  "utf8",
);

describe("CoverArt sizes", () => {
  it("draws a wrapper for each size, or only the one asked for", () => {
    const d = design();
    const sizes = (els: El[]) =>
      els
        .filter((e) => "data-size" in e.attrs)
        .map((e) => e.attrs["data-size"]);
    expect(sizes(parse(draw(d)))).toEqual(["card", "wide", "banner"]);

    const banner = parse(draw(d, { size: "banner" }));
    expect(sizes(banner)).toEqual(["banner"]);
    // A forced size is always shown, and has no thumbnail fallback to give way to.
    expect(banner.find((e) => "data-size" in e.attrs)?.style.display).toBe(
      "block",
    );
    expect(banner.some((e) => "data-thumb" in e.attrs)).toBe(false);
  });

  it("marks the cover and every layer it draws", () => {
    const d = design((r) => {
      r.words = { ...WORDS };
      r.badge = { kind: "live", text: "", fill: "accent" };
    });
    const els = parse(draw(d));
    expect(has(els[0], "data-cover")).toBe(true);
    const card = within(els, "card");
    for (const id of ["label", "title", "subtitle"]) {
      expect(has(layer(card, id), "data-words")).toBe(true);
    }
    expect(has(layer(card, "badge"), "data-badge")).toBe(true);
    expect(has(layer(card, "logo"), "data-logo")).toBe(true);
    expect(layer(card, "panel")).toBeDefined();
    expect(layer(card, "photo")).toBeDefined();
  });

  it("puts the root in the card class of its look's shape", () => {
    expect(parse(draw(design()))[0].attrs.class).toMatch(/card_34/);
    for (const style of Object.values(SITE_STYLES)) {
      const root = parse(draw(design(() => {}, style.id)))[0];
      expect(root.attrs.class, style.id).toContain(
        `card_${style.coverAspect.replace("/", "")}`,
      );
    }
    expect(
      parse(draw(design(), { className: "rounded-lg" }))[0].attrs.class,
    ).toContain("rounded-lg");
  });

  it("switches size at the geometric means of the neighbouring shapes, and under 180 px shows the photo alone", () => {
    const asks = [
      ...css.matchAll(
        /@container \(min-aspect-ratio: (\d+)\/(\d+)\)\s*\{\s*\.(card_\w+)/g,
      ),
    ];
    const cards: [string, number][] = [
      ["card_34", 3 / 4],
      ["card_45", 4 / 5],
      ["card_11", 1],
      ["card_43", 4 / 3],
      ["card_32", 3 / 2],
      ["card_1610", 16 / 10],
    ];
    for (const [name, aspect] of cards) {
      const thresholds = asks
        .filter((m) => m[3] === name)
        .map((m) => Number(m[1]) / Number(m[2]));
      expect(thresholds, name).toHaveLength(2);
      expect(thresholds[0], name).toBeCloseTo(Math.sqrt(aspect * (16 / 9)), 3);
      expect(thresholds[1], name).toBeCloseTo(Math.sqrt((16 / 9) * 3), 3);
    }
    // Narrower than 180 px (a fractional width included): the last rule in the file, so it wins.
    const small = css.slice(css.lastIndexOf("@container"));
    expect(small).toMatch(/^@container \(max-width: 179\.99px\)/);
    expect(small).toMatch(/\[data-size\]\s*\{\s*display: none/);
    expect(small).toMatch(/\[data-thumb\]\s*\{\s*display: block/);
  });
});

describe("CoverArt photo", () => {
  it("draws the tinted placeholder when there is no photo URL", () => {
    const empties = (d: CoverDesign) =>
      parse(draw(d)).filter((e) => "data-empty-image" in e.attrs).length;
    expect(empties(design())).toBe(0);
    // No photo chosen, and a photo whose row is gone (the payload leaves it out).
    expect(empties(design((r) => (r.photo.id = null)))).toBe(3);
    expect(empties(design(() => {}, "atelier", { photos: {} }))).toBe(3);
  });

  it("puts her photo through focus, zoom, adjustments and darken, and the look's effects on the img", () => {
    const d = design((r) => {
      r.photo = {
        id: PHOTO,
        focus: [0.25, 0.75],
        zoom: 1.5,
        brightness: 1.2,
        contrast: 0.9,
        saturation: 1.1,
        darken: 0.4,
      };
    });
    const card = within(
      parse(draw(d, { photoClassName: "grayscale" })),
      "card",
    );
    const img = card.find((e) => e.tag === "img" && e.attrs.src === PHOTO_URL)!;
    const adjust = card[card.indexOf(img) - 1];
    const darken = card[card.indexOf(img) + 1];
    expect(img.style["object-position"]).toBe("25% 75%");
    expect(img.attrs.class).toContain("grayscale");
    // The look's classes and her adjustments sit on different elements, so neither beats the other.
    expect(adjust.attrs.class ?? "").not.toContain("grayscale");
    expect(adjust.style.transform).toBe("scale(1.5)");
    expect(adjust.style["transform-origin"]).toBe("25% 75%");
    expect(adjust.style.filter).toBe(
      "brightness(1.2) contrast(0.9) saturate(1.1)",
    );
    expect(darken.style.background).toBe("rgb(0 0 0 / 0.4)");

    const plain = within(parse(draw(design())), "card");
    const plainImg = plain.find((e) => e.attrs.src === PHOTO_URL)!;
    const plainAdjust = plain[plain.indexOf(plainImg) - 1];
    expect(plainAdjust.style.transform).toBeUndefined();
    expect(plainAdjust.style.filter).toBeUndefined();
    expect(plain.some((e) => e.style.background?.startsWith("rgb(0 0 0"))).toBe(
      false,
    );
  });

  it("shows the photo alone in a frame under 180 px, and the panel colour with no photo", () => {
    const palette = coverPalette(SITE_STYLES.atelier, null);
    const thumbOf = (d: CoverDesign) => {
      const els = parse(draw(d));
      const at = els.findIndex((e) => "data-thumb" in e.attrs);
      const end = els.findIndex((e) => "data-size" in e.attrs);
      return { root: els[0], inside: els.slice(at + 1, end) };
    };
    const full = thumbOf(
      design((r) => {
        r.words = { ...WORDS };
        r.badge = { kind: "live", text: "", fill: "accent" };
      }),
    );
    expect(full.inside.filter((e) => e.tag === "img")).toHaveLength(1);
    expect(full.inside.find((e) => e.tag === "img")?.attrs.src).toBe(PHOTO_URL);
    expect(
      full.inside.some((e) => e.attrs["data-layer"] || "data-words" in e.attrs),
    ).toBe(false);
    expect(full.root.style.background).toBe(palette.primary);

    // A title-only layout has no photo to show; neither does a cover without one.
    expect(thumbOf(design((r) => (r.layout = "title"))).inside).toHaveLength(0);
    const noPhoto = thumbOf(design((r) => (r.photo.id = null)));
    expect(noPhoto.inside.filter((e) => e.tag === "img")).toHaveLength(0);
    expect(noPhoto.inside.some((e) => "data-empty-image" in e.attrs)).toBe(
      false,
    );
  });
});

describe("CoverArt words", () => {
  it("draws the item's title until she types another", () => {
    expect(draw(design())).toContain(">Morning flow<");
    const typed = draw(
      design((r) => {
        r.words.title = "Spring intensive";
      }),
    );
    expect(typed).toContain(">Spring intensive<");
    expect(typed).not.toContain("Morning flow");
  });

  it("clamps each word to the lines its frame holds, within 1 / 3 / 3", () => {
    const d = design((r) => {
      r.words = { ...WORDS };
    });
    for (const size of ["card", "wide", "banner"] as const) {
      const card = within(parse(draw(d, { size })), size);
      for (const part of ["label", "title", "subtitle"] as const) {
        expect(clamp(card, part), `${size} ${part}`).toBe(lines(d, size, part));
      }
    }
    const els = parse(draw(d));
    const title = layer(within(els, "card"), "title");
    expect(title?.style["font-size"]).toBe("min(9.5cqmin, 7.125cqh, 9.5cqw)");
    // The same two limits, pinned as numbers: the title frame of a 3:4 Card holds two lines (a fixed
    // 3 would overrun it); a 4:3 look's Wide holds three.
    const only = design(() => {}, "atelier");
    expect(clamp(within(parse(draw(only)), "card"), "title")).toBe(2);
    const ledger = design(() => {}, "ledger");
    expect(clamp(within(parse(draw(ledger)), "wide"), "title")).toBe(3);
    expect(clamp(within(parse(draw(ledger)), "card"), "title")).toBe(3);
    // The clamp is the browser's own, in the style of the element holding the text.
    const span = after(
      within(els, "wide"),
      layer(within(els, "wide"), "title"),
    );
    expect(span.style).toMatchObject({
      display: "-webkit-box",
      "-webkit-box-orient": "vertical",
      overflow: "hidden",
    });
  });

  it("never gives a word more lines than 1 / 3 / 3, in a frame she made taller", () => {
    const tall: Frame = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    const d = design((r) => {
      r.words = { ...WORDS };
      r.overrides = { card: { label: tall, title: tall, subtitle: tall } };
    });
    const card = within(parse(draw(d)), "card");
    expect(clamp(card, "label")).toBe(1);
    expect(clamp(card, "title")).toBe(3);
    expect(clamp(card, "subtitle")).toBe(3);
  });

  it("never sets a word taller than its frame, in any frame its size is the nearest for", () => {
    // The frame of a word, as its layout made it, is a fraction of the frame it is drawn in; text is
    // set in container units, so in a frame of another shape than the layout's the text must follow
    // the frame's height too, or the words of a portrait Card in a squarer frame spill over each other.
    const terms = (value: string, w: number, h: number) =>
      [...value.matchAll(/([\d.]+)(cqmin|cqw|cqh)/g)].map(
        ([, n, unit]) =>
          (Number(n) *
            { cqmin: Math.min(w, h), cqw: w, cqh: h }[unit as "cqw"]) /
          100,
      );
    const px = (value: string, w: number, h: number) =>
      Math.min(...terms(value, w, h));
    let checked = 0;
    for (const look of Object.values(SITE_STYLES)) {
      const d = design((r) => {
        r.words = { ...WORDS };
      }, look.id);
      for (const size of ["card", "wide", "banner"] as const) {
        const nominal = sizeAspect(size, look.coverAspect);
        for (const shape of [0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
          const aspect = nominal * shape;
          if (nearestSize(aspect, look.coverAspect) !== size) continue;
          const [w, h] = [400, 400 / aspect];
          const els = within(parse(draw(d)), size);
          const frames = framesFor(d.recipe, size, look.coverAspect);
          for (const part of ["label", "title", "subtitle"] as const) {
            const value = layer(els, part)!.style["font-size"];
            const font = px(value, w, h);
            if (shape === 1) {
              // At the layout's own shape the three lengths are one.
              const [a, b, c] = terms(value, w, h);
              expect(
                Math.abs(a - b) + Math.abs(a - c),
                `${look.id} ${size} ${part}`,
              ).toBeLessThan(0.01);
            }
            const text = after(els, layer(els, part));
            const needs =
              Number(text.style["-webkit-line-clamp"]) * LEADING[part] * font;
            expect(
              needs,
              `${look.id} ${size} ${part} in ${w}x${Math.round(h)}`,
            ).toBeLessThanOrEqual(frames[part].h * h + 0.01);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("sets words in the look's fonts, at its sizes and its readable colours", () => {
    const style = SITE_STYLES.atelier;
    const palette = coverPalette(style, null);
    const card = within(
      parse(
        draw(
          design((r) => {
            r.words = { ...WORDS };
          }),
        ),
      ),
      "card",
    );
    const [label, title, subtitle] = ["label", "title", "subtitle"].map(
      (id) => layer(card, id)!,
    );
    expect(title.style["font-family"]).toContain(`'${style.fonts.display}'`);
    expect(label.style["font-family"]).toContain(`'${style.fonts.body}'`);
    expect(subtitle.style["font-family"]).toContain(`'${style.fonts.body}'`);
    for (const part of [label, title, subtitle]) {
      expect(part.style.color).toBe(readableOn("primary", palette));
      expect(part.style["text-align"]).toBe("left");
    }
    expect(label.style["text-transform"]).toBe("uppercase");
    // In the box of each word: the label at the bottom, the title in the middle, the subtitle at the top.
    expect(label.style["justify-content"]).toBe("flex-end");
    expect(title.style["justify-content"]).toBe("center");
    expect(subtitle.style["justify-content"]).toBe("flex-start");
  });

  it("follows the layout: white on a full photo, centred on a title-only cover", () => {
    // A light panel, so the readable colour on it is not white by luck.
    const palette = coverPalette(SITE_STYLES.atelier, null);
    const words = (layout: CoverRecipe["layout"]) =>
      layer(
        within(
          parse(
            draw(
              design((r) => {
                r.layout = layout;
                r.panel = "paper";
                r.words = { ...WORDS };
              }),
            ),
          ),
          "card",
        ),
        "title",
      )!;
    expect(readableOn("paper", palette)).not.toBe("#fff");
    expect(words("full").style.color).toBe("#fff");
    expect(words("band").style.color).toBe(readableOn("paper", palette));
    expect(words("title").style["text-align"]).toBe("center");
    expect(words("band").style["text-align"]).toBe("left");
  });

  it("takes her style for a word over the layout's", () => {
    const d = design((r) => {
      r.styles.title = {
        scale: 1.5,
        weight: 800,
        upper: true,
        tracking: 0.1,
        leading: 1.4,
        align: "right",
        color: "#1E5AA8",
        font: "body",
      };
    });
    const { style } = layer(within(parse(draw(d)), "card"), "title")!;
    expect(style).toMatchObject({
      "font-size": "min(14.25cqmin, 10.688cqh, 14.25cqw)",
      "font-weight": "800",
      "text-transform": "uppercase",
      "letter-spacing": "0.1em",
      "line-height": "1.4",
      "text-align": "right",
      color: "#1E5AA8",
    });
    expect(style["font-family"]).toContain(
      `'${SITE_STYLES.atelier.fonts.body}'`,
    );
  });

  it("draws the words in the order the layout stacks them, the photo under a band", () => {
    const ids = (layout: CoverRecipe["layout"], size: CoverSize = "card") => {
      const d = design((r) => {
        r.layout = layout;
        r.words = { ...WORDS };
        r.badge = { kind: "live", text: "", fill: "accent" };
        r.extras = [
          {
            id: "x1",
            type: "shape",
            shape: "rect",
            fill: "accent",
            opacity: 1,
            frame: FRAME,
          },
          {
            id: "x2",
            type: "text",
            text: "Starts Monday",
            style: {},
            frame: FRAME,
          },
        ];
      });
      return within(parse(draw(d, { size })), size)
        .map((e) => e.attrs["data-layer"])
        .filter(Boolean);
    };
    expect(ids("panel")).toEqual([
      "panel",
      "photo",
      "label",
      "title",
      "subtitle",
      "logo",
      "badge",
      "x1",
      "x2",
    ]);
    expect(ids("band")).toEqual([
      "photo",
      "panel",
      "label",
      "title",
      "subtitle",
      "logo",
      "badge",
      "x1",
      "x2",
    ]);
    // Layers a layout does not draw are left out.
    expect(ids("photo")).toEqual(["photo", "logo", "badge", "x1", "x2"]);
  });

  it("darkens the bottom of a full photo behind its words", () => {
    const parts = (mode: "full" | "bare") =>
      within(
        parse(
          draw(
            design((r) => {
              r.layout = "full";
              r.words = { ...WORDS };
            }),
            { mode },
          ),
        ),
        "card",
      );
    const els = parts("full");
    const fade = els.findIndex((e) => /fade/.test(e.attrs.class ?? ""));
    expect(fade).toBeGreaterThan(els.indexOf(layer(els, "photo")!));
    expect(fade).toBeLessThan(els.indexOf(layer(els, "label")!));
    expect(parts("bare").some((e) => /fade/.test(e.attrs.class ?? ""))).toBe(
      false,
    );
  });
});

describe("CoverArt bare mode", () => {
  it("draws no words and no badge, and keeps the photo, panel, shapes and logo", () => {
    const d = design((r) => {
      r.words = { ...WORDS };
      r.badge = { kind: "live", text: "", fill: "accent" };
      r.extras = [
        {
          id: "t1",
          type: "text",
          text: "Starts Monday",
          style: {},
          frame: FRAME,
        },
        {
          id: "b1",
          type: "badge",
          text: "Sold out",
          fill: "accent",
          frame: FRAME,
        },
        {
          id: "s1",
          type: "shape",
          shape: "circle",
          fill: "accent-light",
          opacity: 0.5,
          frame: FRAME,
        },
      ];
    });
    const whole = parse(draw(d));
    expect(whole.some((e) => "data-words" in e.attrs)).toBe(true);
    expect(whole.some((e) => "data-badge" in e.attrs)).toBe(true);

    const bare = parse(draw(d, { mode: "bare" }));
    expect(bare.some((e) => "data-words" in e.attrs)).toBe(false);
    expect(bare.some((e) => "data-badge" in e.attrs)).toBe(false);
    const card = within(bare, "card");
    for (const id of ["panel", "photo", "logo", "s1"]) {
      expect(layer(card, id), id).toBeDefined();
    }
    expect(layer(card, "t1")).toBeUndefined();
    expect(layer(card, "b1")).toBeUndefined();
  });
});

describe("CoverArt logo and badge", () => {
  const logoOf = (
    edit: (r: CoverRecipe) => void,
    rest: Partial<CoverDesign> = {},
  ) => {
    const card = within(parse(draw(design(edit, "atelier", rest))), "card");
    const box = layer(card, "logo");
    return { box, img: box ? after(card, box) : undefined };
  };

  it("tints the logo white or black by its style colour, and leaves any other as it is", () => {
    const filter = (color?: string) =>
      logoOf((r) => {
        if (color) r.styles.logo = { color: color as Paint };
      }).img?.style.filter;
    expect(filter()).toBeUndefined();
    expect(filter("white")).toBe("brightness(0) invert(1)");
    expect(filter("black")).toBe("brightness(0)");
    expect(filter("accent")).toBeUndefined();
    expect(filter("#ffffff")).toBeUndefined();
    expect(logoOf(() => {}).img?.attrs.src).toBe(LOGO_URL);
  });

  it("draws no logo without one, or when she turned it off", () => {
    expect(logoOf(() => {}, { logo_url: null }).box).toBeUndefined();
    expect(logoOf((r) => (r.logo = false)).box).toBeUndefined();
  });

  it("anchors the logo to the left, the centre of a title-only cover, and the badge to the right", () => {
    expect(logoOf(() => {}).img?.style["object-position"]).toBe("left center");
    expect(
      logoOf((r) => (r.layout = "title")).img?.style["object-position"],
    ).toBe("center center");
    const badge = layer(
      within(
        parse(
          draw(
            design((r) => {
              r.badge = { kind: "live", text: "", fill: "accent" };
            }),
          ),
        ),
        "card",
      ),
      "badge",
    )!;
    expect(badge.style["justify-content"]).toBe("flex-end");
  });

  it("draws the badge for its kind on its fill, in one line with an ellipsis", () => {
    const palette = coverPalette(SITE_STYLES.atelier, null);
    const badge = (kind: CoverRecipe["badge"]["kind"], text = "") => {
      const markup = draw(
        design((r) => {
          r.badge = { kind, text, fill: "accent" };
        }),
      );
      const card = within(parse(markup), "card");
      const box = layer(card, "badge");
      return { markup, box, pill: box ? after(card, box) : undefined };
    };
    const live = badge("live");
    expect(live.markup).toContain(">Live<");
    expect(live.pill?.style.background).toBe(palette.accent);
    expect(live.pill?.style.color).toBe(readableOn("accent", palette));
    expect(live.pill?.style).toMatchObject({
      "white-space": "nowrap",
      overflow: "hidden",
      "text-overflow": "ellipsis",
    });
    expect(badge("new").markup).toContain(">New<");
    expect(badge("text", "Early bird").markup).toContain(">Early bird<");
    // A badge with nothing to say is not drawn: a kind none, text left blank, a course past 30 days.
    expect(badge("none").box).toBeUndefined();
    expect(badge("text", "  ").box).toBeUndefined();
    const old = draw(
      design((r) => {
        r.badge = { kind: "new", text: "", fill: "accent" };
      }),
      { item: { ...ITEM, createdAt: "2026-08-01T00:00:00Z" } },
    );
    expect(old).not.toContain("data-badge");
  });
});

describe("CoverArt extras", () => {
  it("draws her text, badge and shapes above the parts, each in its frame", () => {
    const d = design((r) => {
      r.extras = [
        {
          id: "x1",
          type: "shape",
          shape: "circle",
          fill: "accent-light",
          opacity: 0.5,
          frame: FRAME,
        },
        {
          id: "x2",
          type: "shape",
          shape: "arch",
          fill: "#1E5AA8",
          opacity: 1,
          frame: FRAME,
        },
        {
          id: "x3",
          type: "text",
          text: "Starts Monday",
          style: { color: "white" },
          frame: FRAME,
        },
        {
          id: "x4",
          type: "badge",
          text: "Sold out",
          fill: "ink",
          frame: FRAME,
        },
      ];
    });
    const palette = coverPalette(SITE_STYLES.atelier, null);
    const card = within(parse(draw(d)), "card");
    const [x1, x2, x3, x4] = ["x1", "x2", "x3", "x4"].map(
      (id) => layer(card, id)!,
    );
    expect(x1.style).toMatchObject({
      left: "10%",
      top: "10%",
      width: "50%",
      height: "10%",
      background: palette["accent-light"],
      opacity: "0.5",
      "border-radius": "50%",
    });
    expect(x2.style.background).toBe("#1E5AA8");
    expect(x2.style["border-radius"]).toBe("999px 999px 0 0");
    expect(has(x3, "data-words")).toBe(true);
    expect(x3.style.color).toBe(palette.white);
    // Set as a subtitle is, and clamped to the lines its frame holds.
    expect(x3.style["font-size"]).toMatch(
      /^min\(5\.61cqmin, 4\.20\dcqh, 5\.61cqw\)$/,
    );
    expect(clamp(card, "x3")).toBe(
      fitLines(
        FRAME,
        0.75,
        textSize("panel", "subtitle", 0.75),
        LEADING.subtitle,
      ),
    );
    expect(has(x4, "data-badge")).toBe(true);
    expect(after(card, x4).style.background).toBe(palette.ink);
    expect(after(card, x4).style.color).toBe(readableOn("ink", palette));
  });

  it("uses the frame she set for a size, and only for that size", () => {
    const moved: Frame = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
    const d = design((r) => {
      r.overrides = { wide: { photo: moved } };
    });
    const els = parse(draw(d));
    expect(layer(within(els, "wide"), "photo")?.style).toMatchObject({
      left: "50%",
      top: "50%",
      width: "25%",
      height: "25%",
    });
    expect(layer(within(els, "card"), "photo")?.style.left).not.toBe("50%");
  });
});

describe("LookFonts", () => {
  it("links the look's Google Fonts", () => {
    const palette = SITE_STYLES.atelier.palettes[0].id;
    const els = parse(
      renderToStaticMarkup(
        createElement(LookFonts, { look: `atelier:${palette}` }),
      ),
    );
    expect(els).toHaveLength(1);
    expect(els[0].tag).toBe("link");
    expect(els[0].attrs.rel).toBe("stylesheet");
    expect(els[0].attrs.href).toBe(styleFontsHref(SITE_STYLES.atelier));
  });
});
