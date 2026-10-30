import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup as renderBare } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { CoverArt } from "@/components/covers/cover-art";
import { SiteLocaleBoundary } from "@shared/i18n/site-preview";
import { LookFonts } from "@/components/covers/look-fonts";
import { fitLines, LAYOUTS, LEADING, textSize } from "@/lib/covers/layouts";
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

// useLocale needs a provider; the components under test read no messages.
// createElement wants children among this provider's props; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  children?: React.ReactNode;
}>;
const renderToStaticMarkup = (el: Parameters<typeof renderBare>[0]) =>
  renderBare(createElement(Intl, { locale: "en" }, el));

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
const num = (value: string | undefined) => Number.parseFloat(value ?? "");
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
    // Zoomed about the focus, the photo is clipped to its frame, not drawn over the panel and the words.
    expect(layer(card, "photo")?.style.overflow).toBe("hidden");

    const plain = within(parse(draw(design())), "card");
    const plainImg = plain.find((e) => e.attrs.src === PHOTO_URL)!;
    const plainAdjust = plain[plain.indexOf(plainImg) - 1];
    expect(plainAdjust.style.transform).toBeUndefined();
    expect(plainAdjust.style.filter).toBeUndefined();
    expect(plain.some((e) => e.style.background?.startsWith("rgb(0 0 0"))).toBe(
      false,
    );
    // Clipped at zoom 1 too: a look's `group-hover:scale-*` on the img would otherwise push it out.
    expect(layer(plain, "photo")?.style.overflow).toBe("hidden");
  });

  it("clips the photo to its frame in every layout and size", () => {
    let photos = 0;
    for (const layout of LAYOUTS) {
      const d = design((r) => {
        r.layout = layout;
        r.photo.zoom = 2;
      });
      for (const size of ["card", "wide", "banner"] as const) {
        const photo = layer(within(parse(draw(d)), size), "photo");
        // The `title` layout has no photo; every other has one, clipped.
        if (layout === "title") expect(photo).toBeUndefined();
        else expect(photo?.style.overflow, `${layout} ${size}`).toBe("hidden");
        if (photo) photos++;
      }
    }
    expect(photos).toBe((LAYOUTS.length - 1) * 3);
  });

  it("loads the photo lazily, or eagerly at high priority when asked, and never her logo eagerly", () => {
    const imgs = (
      src: string,
      props: Partial<ComponentProps<typeof CoverArt>>,
    ) =>
      parse(draw(design(), props)).filter(
        (e) => e.tag === "img" && e.attrs.src === src,
      );
    // The thumbnail's and one for each size.
    expect(imgs(PHOTO_URL, {})).toHaveLength(4);
    for (const img of imgs(PHOTO_URL, {})) {
      expect(img.attrs.loading).toBe("lazy");
      expect(img.attrs).not.toHaveProperty("fetchpriority");
      expect(img.attrs).not.toHaveProperty("data-site-img");
    }
    for (const img of imgs(PHOTO_URL, { priority: true })) {
      expect(img.attrs.loading).toBe("eager");
      expect(img.attrs.fetchpriority).toBe("high");
      // SiteMotion holds every other image at opacity 0 until it loads; this one shows at once
      expect(img.attrs["data-site-img"]).toBe("priority");
    }
    const logos = imgs(LOGO_URL, { priority: true });
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo.attrs.loading).toBe("lazy");
      expect(logo.attrs).not.toHaveProperty("data-site-img");
    }
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

  it("gives each clamp room for the ink outside its lines, and a clip under the last one", () => {
    const d = design((r) => {
      r.words = { ...WORDS };
    });
    for (const size of ["card", "wide", "banner"] as const) {
      const els = within(parse(draw(d, { size })), size);
      for (const part of ["label", "title", "subtitle"] as const) {
        const { style } = after(els, layer(els, part));
        // The room is given back by the margins, so the word is laid out as its lines alone.
        expect(style["padding-block"], `${size} ${part}`).toBe("0.3em");
        expect(style["margin-block"], `${size} ${part}`).toBe("-0.3em");
        expect(style["clip-path"], `${size} ${part}`).toMatch(
          /^inset\(0 0 calc\(0\.3em - -?\d+(\.\d+)?em\) 0\)$/,
        );
      }
    }
  });

  it("draws the clip for the word's own font and line height", () => {
    const clip = (look: string, edit: (r: CoverRecipe) => void = () => {}) => {
      const els = within(
        parse(
          draw(
            design((r) => {
              r.words = { ...WORDS };
              edit(r);
            }, look),
          ),
        ),
        "card",
      );
      return after(els, layer(els, "title")).style["clip-path"];
    };
    // Another look sets its title in another font. A looser line height moves the two lines' ink apart
    // by the same amount each way, so the clip half way between them stays where it was.
    expect(clip("journal")).not.toBe(clip("atelier"));
    expect(
      clip("journal", (r) => {
        r.styles.title = { leading: 1.6 };
      }),
    ).toBe(clip("journal"));
    // Her font for the title is the font of its clip: journal's body font for its display one.
    expect(
      clip("journal", (r) => {
        r.styles.title = { font: "body" };
      }),
    ).not.toBe(clip("journal"));
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
    // With no colour of hers it takes the readable one for what it sits on (see "logo tint").
    expect(filter()).toBe("brightness(0) invert(1)");
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

  /** The 24 characters a badge holds at most. */
  const LONGEST = "Early bird registration!";
  const badgeOf = (
    edit: (r: CoverRecipe) => void,
    look = "atelier",
    size: CoverSize = "card",
    rest: Partial<CoverDesign> = {},
  ) => {
    const els = within(parse(draw(design(edit, look, rest), { size })), size);
    const box = layer(els, "badge")!;
    return { els, box, pill: after(els, box) };
  };
  const longBadge = (r: CoverRecipe) => {
    r.badge = { kind: "text", text: LONGEST, fill: "accent" };
  };

  it("sizes a badge to its text, from the corner of its frame, with the ellipsis only past a cap", () => {
    expect(LONGEST).toHaveLength(24);
    // The longest badge, on a 4:3 look at Card: no frame-wide chip, room for the whole text (it needs
    // 41 to 57% of the cover's width). That look's panel is beside its photo, so the logo is in the
    // badge's row and the chip may grow up to it: 95.9% - 41.6% (the logo's frame, 10 cqmin high and
    // five times as wide) - 2.3% = 52%.
    const { box, pill } = badgeOf(longBadge, "ledger");
    expect(pill.style.width).toBe("max-content");
    expect(pill.style["max-width"]).toBe("52cqw");
    // A 3:4 look keeps its logo in the panel under the photo, so its badge has the whole cap.
    expect(badgeOf(longBadge).pill.style["max-width"]).toBe("77cqw");
    expect(pill.style).toMatchObject({
      "white-space": "nowrap",
      overflow: "hidden",
      "text-overflow": "ellipsis",
    });
    expect(box.style["justify-content"]).toBe("flex-end");
    // The chip must not shrink to its frame (a flex item does unless told not to), nor stop at it.
    const rule = /\.pill\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/flex:\s*none/);
    expect(rule).not.toMatch(/max-width/);
    // The cap is the whole chip, padding included, whatever the page's own box-sizing is.
    expect(rule).toMatch(/box-sizing:\s*border-box/);
    // A badge she aligned to the left or the centre grows the other way.
    const side = (align: "left" | "center") =>
      badgeOf((r) => {
        longBadge(r);
        r.styles.badge = { align };
      }).box.style["justify-content"];
    expect(side("left")).toBe("flex-start");
    expect(side("center")).toBe("center");
    // And stops at the cover's edge: the frame of atelier's Card badge is 62.5% to 94.5% across, so
    // growing rightwards from 62.5% leaves 37.5%, and both ways from its centre leaves twice 21.5%.
    const cap = (align: "left" | "center") =>
      badgeOf((r) => {
        longBadge(r);
        r.styles.badge = { align };
      }).pill.style["max-width"];
    expect(cap("left")).toBe("37.5cqw");
    expect(cap("center")).toBe("43cqw");
  });

  it("centres the badge of a title-only cover above its words, with the whole cap, logo or not", () => {
    const title = (rest: Partial<CoverDesign>) =>
      badgeOf(
        (r) => {
          longBadge(r);
          r.layout = "title";
          r.words = { ...WORDS };
        },
        "atelier",
        "card",
        rest,
      );
    // The badge is the first line of the centred stack, with a row of its own: it grows both ways
    // from the middle, and no logo is in the way.
    for (const rest of [{}, { logo_url: null }]) {
      const { box, pill, els } = title(rest);
      expect(box.style["justify-content"]).toBe("center");
      expect(pill.style["max-width"]).toBe("77cqw");
      expect(num(box.style.top)).toBeGreaterThan(
        num(layer(els, "logo")?.style.top ?? "0"),
      );
    }
  });

  it("follows a logo she moved: in another row it leaves the badge its cap, in the badge's row it limits it", () => {
    const cap = (logo: Frame) =>
      badgeOf((r) => {
        longBadge(r);
        r.overrides = { card: { logo } };
      }).pill.style["max-width"];
    // atelier's Card badge is in the top row, 62.5% to 94.5% across. A logo down the cover is no
    // neighbour, above or below; one in the row at 30% to 50% leaves 94.5% - 53% (its right edge and
    // 3 cqmin).
    expect(cap({ x: 0.3, y: 0.5, w: 0.2, h: 0.06 })).toBe("77cqw");
    expect(cap({ x: 0.3, y: 0, w: 0.2, h: 0.03 })).toBe("77cqw");
    expect(cap({ x: 0.3, y: 0.05, w: 0.2, h: 0.06 })).toBe("41.5cqw");
  });

  it("keeps a framed badge on its photo, however she aligns it", () => {
    const cap = (size: CoverSize, align?: "left" | "center") =>
      badgeOf(
        (r) => {
          r.layout = "framed";
          longBadge(r);
          if (align) r.styles.badge = { align };
        },
        "atelier",
        size,
      ).pill.style["max-width"];
    // Wide: the photo is 3.4% to 47.4% across, so a chip hung from the right of its frame (45.7%)
    // has the photo's width less 3 cqmin at each end: 45.7% - (3.4% + 1.7%).
    expect(cap("wide")).toBe("40.625cqw");
    // Card: the frame is already at the photo's right edge, so turned to the left or to the centre
    // the chip has no more room than the frame (32%).
    expect(cap("card", "left")).toBe("32cqw");
    expect(cap("card", "center")).toBe("32cqw");
  });

  it("never lets a grown badge reach the logo, the words or the cover's edge", () => {
    const rect = (e: El) => ({
      x: num(e.style.left) / 100,
      y: num(e.style.top) / 100,
      w: num(e.style.width) / 100,
      h: num(e.style.height) / 100,
    });
    type Box = { x: number; y: number; w: number; h: number };
    const meets = (a: Box, b: Box) =>
      a.x < b.x + b.w - 1e-6 &&
      b.x < a.x + a.w - 1e-6 &&
      a.y < b.y + b.h - 1e-6 &&
      b.y < a.y + a.h - 1e-6;
    let checked = 0;
    let lowered = 0;
    for (const look of Object.values(SITE_STYLES)) {
      for (const layout of LAYOUTS) {
        for (const size of ["card", "wide", "banner"] as const) {
          const { els, box, pill } = badgeOf(
            (r) => {
              r.layout = layout;
              r.words = { ...WORDS };
              longBadge(r);
            },
            look.id,
            size,
          );
          const at = `${look.id} ${layout} ${size}`;
          const frame = rect(box);
          const cap = num(pill.style["max-width"]) / 100;
          expect(pill.style["max-width"], at).toMatch(/cqw$/);
          // Never narrower than its frame, never wider than the cap (unless her frame already is).
          expect(cap, at).toBeGreaterThanOrEqual(
            Math.min(frame.w, 0.77) - 1e-6,
          );
          expect(cap, at).toBeLessThanOrEqual(0.77 + 1e-6);
          if (cap < 0.77 - 1e-6) lowered++;
          // Where the chip is at its widest: it hangs from the right of its frame, and from the
          // middle of it on a title-only cover.
          const centred = layout === "title";
          expect(box.style["justify-content"], at).toBe(
            centred ? "center" : "flex-end",
          );
          const grown = {
            x: centred
              ? frame.x + frame.w / 2 - cap / 2
              : frame.x + frame.w - cap,
            y: frame.y,
            w: cap,
            h: frame.h,
          };
          expect(grown.x, at).toBeGreaterThanOrEqual(-1e-6);
          expect(grown.x + grown.w, at).toBeLessThanOrEqual(1 + 1e-6);
          const logo = layer(els, "logo");
          if (logo) expect(meets(grown, rect(logo)), `${at} logo`).toBe(false);
          for (const part of ["label", "title", "subtitle"]) {
            const word = layer(els, part);
            if (word)
              expect(meets(grown, rect(word)), `${at} ${part}`).toBe(false);
            // The logo, five times as wide as high, is clear of the words too.
            if (word && logo) {
              expect(meets(rect(logo), rect(word)), `${at} logo/${part}`).toBe(
                false,
              );
            }
          }
          // On a framed cover the badge belongs to its photo and stays on it.
          const photo = layer(els, "photo");
          if (layout === "framed") {
            const on = rect(photo!);
            expect(grown.x, `${at} photo`).toBeGreaterThanOrEqual(on.x - 1e-6);
            expect(grown.x + grown.w, `${at} photo`).toBeLessThanOrEqual(
              on.x + on.w + 1e-6,
            );
          }
          // In a title-only or a framed cover the badge's frame has a row of its own.
          if ((layout === "title" || layout === "framed") && logo) {
            const l = rect(logo);
            expect(
              l.y < frame.y + frame.h - 1e-6 && frame.y < l.y + l.h - 1e-6,
              `${at} shares the logo's row`,
            ).toBe(false);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(21 * LAYOUTS.length * 3);
    // Where the badge still shares a row with the logo (full, band and photo, beside it) or sits on an
    // inset photo (framed), the room can be less than the cap.
    expect(lowered).toBeGreaterThan(0);
  });

  it("gives the longest badge the whole cap where it has a row and the width of the cover to itself", () => {
    // 24 characters take up to 77% of a Card's width. A title-only badge has the whole cover; a
    // portrait or square Card's panel layout has its logo in the panel, and its framed layout a photo
    // 82% across. A landscape framed Card's photo is about 40% across, so its badge has that.
    for (const style of Object.values(SITE_STYLES)) {
      const portrait = ["3/4", "4/5", "1/1"].includes(style.coverAspect);
      for (const layout of ["panel", "title", "framed"] as const) {
        if (layout !== "title" && !portrait) continue;
        const { pill } = badgeOf(
          (r) => {
            r.layout = layout;
            longBadge(r);
          },
          style.id,
          "card",
        );
        expect(pill.style["max-width"], `${style.id} ${layout}`).toBe("77cqw");
      }
    }
    const landscape = badgeOf((r) => {
      r.layout = "framed";
      longBadge(r);
    }, "ledger");
    expect(num(landscape.pill.style["max-width"])).toBeLessThan(45);
  });
});

describe("CoverArt logo tint and box", () => {
  const WHITE = "brightness(0) invert(1)";
  const BLACK = "brightness(0)";
  const SIZES_ALL = ["card", "wide", "banner"] as const;
  /** The filter on the logo's img, for a layout and size, on a panel, with her photo or without. */
  const tint = (
    layout: CoverRecipe["layout"],
    size: CoverSize,
    panel: Paint,
    opts: { look?: string; photo?: boolean; color?: Paint } = {},
  ) => {
    const els = within(
      parse(
        draw(
          design((r) => {
            r.layout = layout;
            r.panel = panel;
            if (opts.photo === false) r.photo.id = null;
            if (opts.color) r.styles.logo = { color: opts.color };
          }, opts.look ?? "atelier"),
          { size },
        ),
      ),
      size,
    );
    return after(els, layer(els, "logo")).style.filter;
  };

  it("takes the readable colour of the panel it sits on: white on a dark one, black on a light one, as text does", () => {
    const palette = coverPalette(SITE_STYLES.atelier, null);
    expect(readableOn("primary", palette)).toBe("#fff");
    expect(readableOn("paper", palette)).not.toBe("#fff");
    for (const size of SIZES_ALL) {
      // panel: the logo is on the panel (under the photo, or at the top of it beside the photo).
      expect(tint("panel", size, "primary"), `panel ${size}`).toBe(WHITE);
      expect(tint("panel", size, "paper"), `panel ${size}`).toBe(BLACK);
      // title-only: the whole cover is the panel.
      expect(tint("title", size, "primary"), `title ${size}`).toBe(WHITE);
      expect(tint("title", size, "paper"), `title ${size}`).toBe(BLACK);
    }
  });

  it("is white on a photo, and follows the colour only where the logo is on it", () => {
    for (const size of SIZES_ALL) {
      for (const panel of ["primary", "paper"] as const) {
        // The whole cover is the photo; in framed the logo sits on the inset photo.
        for (const layout of ["full", "photo", "framed"] as const) {
          expect(tint(layout, size, panel), `${layout} ${size} ${panel}`).toBe(
            WHITE,
          );
        }
      }
    }
    // A band is at the bottom, so at Card and Wide the logo at the top is on the photo; at Banner the
    // band is the left of the cover and the logo is on it.
    for (const size of ["card", "wide"] as const) {
      expect(tint("band", size, "paper"), `band ${size}`).toBe(WHITE);
    }
    expect(tint("band", "banner", "primary")).toBe(WHITE);
    expect(tint("band", "banner", "paper")).toBe(BLACK);
  });

  it("reads the colour, not the name: a dark look's paper is dark, its ink is light", () => {
    const palette = coverPalette(SITE_STYLES.nocturne, null);
    expect(readableOn("paper", palette)).toBe("#fff");
    expect(readableOn("ink", palette)).not.toBe("#fff");
    // Text is white on the dark paper and dark on the light ink, and so is the logo.
    expect(tint("title", "card", "paper", { look: "nocturne" })).toBe(WHITE);
    expect(tint("title", "card", "ink", { look: "nocturne" })).toBe(BLACK);
  });

  it("reads the colour of the placeholder where the photo is not there", () => {
    // No photo yet: the logo is on the tint the cover draws in its place, a light one on a light look.
    const palette = coverPalette(SITE_STYLES.atelier, null);
    expect(readableOn("surface", palette)).not.toBe("#fff");
    for (const layout of ["full", "photo", "framed"] as const) {
      expect(tint(layout, "card", "primary", { photo: false }), layout).toBe(
        BLACK,
      );
    }
  });

  it("leaves what she set alone: white, black, or any other colour as it is", () => {
    for (const panel of ["primary", "paper"] as const) {
      expect(tint("panel", "card", panel, { color: "white" })).toBe(WHITE);
      expect(tint("panel", "card", panel, { color: "black" })).toBe(BLACK);
      expect(tint("panel", "card", panel, { color: "accent" })).toBeUndefined();
      expect(tint("full", "card", panel, { color: "#1E5AA8" })).toBeUndefined();
    }
  });

  it("draws the logo in a box five times as wide as it is high, from the layout's side, so a lockup keeps the height of a mark", () => {
    const toCqmin = (value: string | undefined) => num(value) / 100;
    for (const style of Object.values(SITE_STYLES)) {
      for (const layout of LAYOUTS) {
        for (const size of SIZES_ALL) {
          const els = within(
            parse(
              draw(
                design((r) => (r.layout = layout), style.id),
                { size },
              ),
            ),
            size,
          );
          const box = layer(els, "logo")!;
          const img = after(els, box);
          const aspect = sizeAspect(size, style.coverAspect);
          const w = toCqmin(box.style.width) * 100 * Math.max(1, aspect);
          const h = toCqmin(box.style.height) * (100 / Math.min(1, aspect));
          const at = `${style.id} ${layout} ${size}`;
          expect(w / h, at).toBeCloseTo(5, 3);
          // The image fills its box by height and is contained, so a lockup of up to 5:1 is drawn
          // at the box's height and a square mark at its own width: from the left, from the centre in
          // a title-only cover.
          expect(img.attrs.class, at).toContain("contain");
          expect(img.style["object-position"], at).toBe(
            layout === "title" ? "center center" : "left center",
          );
        }
      }
    }
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
    // A badge extra is sized to its text like the badge, from the right of its frame (at 60% across, so
    // that is the room it has to the cover's edge), up to the cap.
    expect(after(card, x4).style.width).toBe("max-content");
    expect(after(card, x4).style["max-width"]).toBe("60cqw");
    expect(x4.style["justify-content"]).toBe("flex-end");
    expect(after(card, x4).style.background).toBe(palette.ink);
    expect(after(card, x4).style.color).toBe(readableOn("ink", palette));
  });

  it("stops a badge extra at the cover's edge, however long its text", () => {
    const cap = (frame: Frame) => {
      const d = design((r) => {
        r.extras = [
          {
            id: "b1",
            type: "badge",
            text: "Early bird registration!",
            fill: "accent",
            frame,
          },
        ];
      });
      const card = within(parse(draw(d, { size: "card" })), "card");
      return after(card, layer(card, "b1")).style["max-width"];
    };
    // Grown leftwards from a right edge at 35% across it has 35% of the cover; from 90%, the cap.
    expect(cap({ x: 0.05, y: 0.1, w: 0.3, h: 0.08 })).toBe("35cqw");
    expect(cap({ x: 0.6, y: 0.1, w: 0.3, h: 0.08 })).toBe("77cqw");
    // Never less than its own frame, even where the frame is wider than the room it leaves.
    expect(cap({ x: 0, y: 0.1, w: 0.2, h: 0.08 })).toBe("20cqw");
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

describe("CoverArt with hostile text", () => {
  // Words are hers, a course's title is hers and a badge's text is hers: all of it reaches the page as text,
  // never as markup.
  const HOSTILE: [raw: string, escaped: string][] = [
    ["<script>x</script>", "&lt;script&gt;x&lt;/script&gt;"],
    [
      '"><img src=x onerror=alert(1)>',
      "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;",
    ],
  ];
  const expectOnlyText = (markup: string, raw: string, escaped: string) => {
    expect(markup, raw).not.toContain(raw);
    const els = parse(markup);
    expect(els.filter((e) => e.tag === "script")).toHaveLength(0);
    expect(els.filter((e) => e.tag === "img" && e.attrs.src === "x")).toEqual(
      [],
    );
    // no element of the cover has an event handler
    expect(
      els.filter((e) => Object.keys(e.attrs).some((k) => k.startsWith("on"))),
    ).toEqual([]);
    return markup.split(escaped).length - 1;
  };

  it("escapes a title, a label, a subtitle, a badge, and her text and badge layers", () => {
    for (const [raw, escaped] of HOSTILE) {
      const d = design((r) => {
        r.words = { label: raw, title: raw, subtitle: raw };
        r.badge = { kind: "text", text: raw, fill: "accent" };
        r.extras = [
          { id: "x1", type: "text", text: raw, style: {}, frame: FRAME },
          { id: "x2", type: "badge", text: raw, fill: "ink", frame: FRAME },
        ];
      });
      // each of the six, at least once
      expect(expectOnlyText(draw(d), raw, escaped), raw).toBeGreaterThanOrEqual(
        6,
      );
    }
  });

  it("escapes the course's own title, which a cover with no title of its own follows", () => {
    for (const [raw, escaped] of HOSTILE) {
      const markup = draw(
        design((r) => {
          r.words = { ...WORDS };
        }),
        { item: { ...ITEM, title: raw } },
      );
      expect(expectOnlyText(markup, raw, escaped), raw).toBeGreaterThan(0);
    }
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

describe("CoverArt photo grades, frames and tools", () => {
  it("draws no grade, warmth, blur, frame or flip on a recipe saved before them", () => {
    const card = within(parse(draw(design())), "card");
    const img = card.find((e) => e.attrs.src === PHOTO_URL)!;
    const wrapper = card[card.indexOf(img) - 1];
    expect(wrapper.style.filter).toBeUndefined();
    expect(wrapper.style["mix-blend-mode"]).toBeUndefined();
    const frame = layer(card, "photo")!;
    expect(frame.style["clip-path"]).toBeUndefined();
    expect(frame.style["border-radius"]).toBeUndefined();
    expect(card.some((e) => e.style.transform === "scaleX(-1)")).toBe(false);
  });

  it("follows her look's own grade with Your site, and grades with the look's tint in its colour", () => {
    const filters = (look: string, grade: CoverRecipe["photo"]["grade"]) => {
      const card = within(
        parse(draw(design((r) => (r.photo.grade = grade), look))),
        "card",
      );
      const img = card.find((e) => e.attrs.src === PHOTO_URL)!;
      return { card, wrapper: card[card.indexOf(img) - 1] };
    };
    const mono = filters("atelier", "mono").wrapper.style.filter;
    expect(mono).toBe("grayscale(1) contrast(1.08)");
    // a look whose site wears the mono grade gives "Your site" its filter
    const look = Object.entries(SITE_STYLES).find(
      ([, style]) => style.photoTreatment === "mono",
    )?.[0];
    if (look) expect(filters(look, "site").wrapper.style.filter).toBe(mono);
    // the tint grade lays the cover's own main colour over the photo, never the page's --primary
    const { card } = filters("atelier", "tint");
    const primary = coverPalette(SITE_STYLES.atelier).primary;
    const tint = card.find((e) => e.style["mix-blend-mode"] === "color");
    expect(tint?.style.background).toBe(primary);
  });

  it("draws a duotone in her colours: the darker takes the shadows, the lighter the lights", () => {
    const card = within(
      parse(draw(design((r) => (r.photo.grade = "duo")))),
      "card",
    );
    const palette = coverPalette(SITE_STYLES.atelier);
    const img = card.find((e) => e.attrs.src === PHOTO_URL)!;
    const wrapper = card[card.indexOf(img) - 1];
    expect(wrapper.style["mix-blend-mode"]).toBe("multiply");
    const lighten = card.find((e) => e.style["mix-blend-mode"] === "lighten");
    const ground = card[card.indexOf(wrapper) - 1];
    expect(
      new Set([lighten?.style.background, ground.style.background]),
    ).toEqual(new Set([palette.primary, palette.paper]));
    // its blends stay inside the photo's frame
    expect(layer(card, "photo")?.style.isolation).toBe("isolate");
  });

  it("warms, cools and blurs the photo, cuts its frame to a shape and flips it", () => {
    const card = within(
      parse(
        draw(
          design((r) => {
            r.photo.warmth = 0.5;
            r.photo.blur = 0.4;
            r.photo.mask = "circle";
            r.photo.flip = true;
          }),
        ),
      ),
      "card",
    );
    const warm = card.find((e) => e.style["mix-blend-mode"] === "soft-light");
    expect(warm?.style.background).toBe("rgb(255 150 50)");
    expect(num(warm?.style.opacity)).toBeCloseTo(0.3);
    expect(card.some((e) => e.style.filter?.includes("blur(1cqmin)"))).toBe(
      true,
    );
    expect(layer(card, "photo")?.style["clip-path"]).toBe(
      "circle(closest-side)",
    );
    const img = card.find((e) => e.attrs.src === PHOTO_URL)!;
    expect(card[card.indexOf(img) - 1].style.transform).toBe("scaleX(-1)");
    const cool = within(
      parse(draw(design((r) => (r.photo.warmth = -1)))),
      "card",
    ).find((e) => e.style["mix-blend-mode"] === "soft-light");
    expect(cool?.style.background).toBe("rgb(60 140 255)");
  });

  it("stands a cutout whole at the foot of its frame", () => {
    const card = within(
      parse(draw(design((r) => (r.layout = "cutout")))),
      "card",
    );
    const img = card.find((e) => e.attrs.src === PHOTO_URL)!;
    expect(img.attrs.class).toMatch(/contain/);
    expect(img.style["object-position"]).toBe("50% 100%");
  });
});

describe("CoverArt text effects and marked words", () => {
  const title = (
    style: CoverRecipe["styles"]["title"],
    words = "Find your *calm*",
  ) => {
    const els = parse(
      draw(
        design((r) => {
          r.words.title = words;
          r.styles.title = style;
        }),
      ),
    );
    return within(els, "card");
  };

  it("draws the marked word in the accent, without its stars", () => {
    const card = title({});
    const accent = coverPalette(SITE_STYLES.atelier).accent;
    const word = after(card, after(card, layer(card, "title")));
    expect(word.tag).toBe("span");
    expect(word.style.color).toBe(accent);
    expect(
      draw(design((r) => (r.words.title = "Find your *calm*"))),
    ).not.toContain("*calm*");
  });

  it("gives a highlight's band to the marked words alone, or to all of them where none is marked", () => {
    const marked = title({ effect: "highlight" });
    const bands = marked.filter((e) => /band/.test(e.attrs.class ?? ""));
    expect(bands).toHaveLength(1);
    const plain = title({ effect: "highlight" }, "Find your calm");
    expect(plain.filter((e) => /band/.test(e.attrs.class ?? ""))).toHaveLength(
      1,
    );
    // the words on a band read on it
    const palette = coverPalette(SITE_STYLES.atelier);
    expect(bands[0].style.color).toBe(readableOn("accent", palette));
  });

  it("lifts, shadows and outlines words in her colour or the effect's own", () => {
    const style = (effect: "lift" | "shadow" | "outline", color?: Paint) =>
      layer(title({ effect, effectColor: color }), "title")!.style;
    expect(style("lift")["text-shadow"]).toContain("rgb(0 0 0 / 0.55)");
    expect(style("shadow", "#112233")["text-shadow"]).toBe(
      "0.07em 0.07em 0 #112233",
    );
    expect(style("outline")["-webkit-text-stroke"]).toContain("0.09em");
    expect(style("outline")["paint-order"]).toBe("stroke fill");
  });
});

describe("CoverArt icons, stickers and QR codes", () => {
  it("draws an icon in its colour, a star sticker by its polygon and a QR code of its link", () => {
    const els = within(
      parse(
        draw(
          design((r) => {
            r.extras = [
              {
                id: "i1",
                type: "icon",
                icon: "calendar",
                fill: "#ff0000",
                opacity: 0.5,
                frame: FRAME,
              },
              {
                id: "s1",
                type: "shape",
                shape: "star",
                fill: "accent",
                opacity: 1,
                frame: FRAME,
              },
              {
                id: "q1",
                type: "qr",
                text: "https://yoga.test/courses/flow",
                fill: "black",
                back: "white",
                frame: FRAME,
              },
            ];
          }),
        ),
      ),
      "card",
    );
    expect(layer(els, "i1")?.style.color).toBe("#ff0000");
    expect(after(els, layer(els, "i1")).tag).toBe("svg");
    expect(layer(els, "s1")?.style["clip-path"]).toMatch(/^polygon\(50% 0%/);
    const qr = els.slice(els.indexOf(layer(els, "q1")!));
    expect(qr[1].tag).toBe("svg");
    expect(qr.find((e) => e.tag === "path")?.attrs.fill).toBe("#000");
  });
});

describe("CoverArt in a server page", () => {
  // Server pages (course detail, /render/cover/[token]) render CoverArt. It reads the site's
  // language through a context hook from a "use client" file, which a server component cannot
  // call ("useSiteLocale is not a function"), so the module has to be a client module itself.
  it("is a client module, because it calls the site-language hook", () => {
    const src = readFileSync(path.join(__dirname, "../cover-art.tsx"), "utf8");
    expect(src).toMatch(/useSiteLocale\(\)/);
    expect(src.trimStart()).toMatch(/^"use client";/);
  });

  it("draws in the page's language without a studio boundary", () => {
    expect(draw(design())).not.toMatch(/<div[^>]*data-cover[^>]*lang=/);
  });

  it("draws in the site's language inside a studio boundary", () => {
    const html = renderToStaticMarkup(
      createElement(
        SiteLocaleBoundary as React.FC<{
          locale: string;
          children?: React.ReactNode;
        }>,
        { locale: "tr" },
        createElement(CoverArt, { design: design(), item: ITEM, now: NOW }),
      ),
    );
    expect(html).toMatch(/<div[^>]*data-cover[^>]*lang="tr"/);
  });
});
