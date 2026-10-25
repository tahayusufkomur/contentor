import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  isQrLink,
  LayerToolbar,
  TEXT_DEFAULTS,
  type LayerToolbarProps,
} from "@/components/studio/layer-toolbar";
import { LEADING } from "@/lib/covers/layouts";
import { coverPalette, parseLook } from "@/lib/covers/palette";
import { defaultRecipe, RANGES } from "@/lib/covers/recipe";
import { PARTS } from "@/types/design";
import type { CoverRecipe, Extra, Frame } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
// createElement wants children among the props of this provider's own type; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  timeZone: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const { style, paletteId } = parseLook("journal");
const palette = coverPalette(style, paletteId);

const frame: Frame = { x: 0.1, y: 0.1, w: 0.4, h: 0.1 };
const text = (
  id: string,
  over: Partial<Extract<Extra, { type: "text" }>> = {},
): Extra => ({
  id,
  type: "text",
  text: `Words ${id}`,
  style: {},
  frame,
  ...over,
});
const badge = (id: string): Extra => ({
  id,
  type: "badge",
  text: "Sold out",
  fill: "accent",
  frame,
});
const shape = (id: string): Extra => ({
  id,
  type: "shape",
  shape: "arch",
  fill: "primary",
  opacity: 0.8,
  frame,
});

function toolbar(
  props: Partial<LayerToolbarProps> & { recipe?: CoverRecipe } = {},
) {
  const recipe = props.recipe ?? defaultRecipe();
  const onEdit = vi.fn();
  const markup = renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages },
      createElement(LayerToolbar, { recipe, palette, onEdit, ...props }),
    ),
  );
  return markup;
}

/** The `<select>` with this name: its options, and which is chosen. */
function select(markup: string, name: string) {
  const m = new RegExp(
    `<select aria-label="${name}"[^>]*>([\\s\\S]*?)</select>`,
  ).exec(markup);
  if (!m) return null;
  const options = [
    ...m[1].matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)</g),
  ];
  return {
    labels: options.map((o) => o[3]),
    chosen: options.filter((o) => o[2] !== undefined).map((o) => o[3]),
  };
}

/** Every slider: its label and its ends, step and value. */
function sliders(markup: string) {
  return [
    ...markup.matchAll(
      /<label[^>]*>([^<]*)<input type="range" min="([^"]*)" max="([^"]*)" step="([^"]*)"[^>]*? value="([^"]*)"/g,
    ),
  ].map((m) => ({
    label: m[1],
    min: Number(m[2]),
    max: Number(m[3]),
    step: Number(m[4]),
    value: Number(m[5]),
  }));
}

/** A button by its name: whether it is pressed, and whether it is disabled. */
function button(markup: string, name: string) {
  const m = new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`).exec(markup);
  if (!m) return null;
  return {
    pressed: /aria-pressed="(true|false)"/.exec(m[0])?.[1] ?? null,
    disabled: / disabled=""/.test(m[0]),
  };
}

describe("LayerToolbar: words", () => {
  it("sets a title's font, weight, case, alignment, colour, size, spacing and lines", () => {
    const markup = toolbar({ part: "title" });
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain(">Title<");
    expect(select(markup, "Font")).toEqual({
      labels: ["Heading", "Body"],
      chosen: ["Heading"],
    });
    expect(select(markup, "Weight")).toEqual({
      labels: ["Regular", "Medium", "Semibold", "Bold", "Extra bold"],
      chosen: ["Bold"],
    });
    expect(button(markup, "Capitals")).toEqual({
      pressed: "false",
      disabled: false,
    });
    for (const side of ["Left", "Centre", "Right"]) {
      expect(button(markup, side), side).not.toBeNull();
    }
    expect(button(markup, "Left")?.pressed).toBe("true");
    expect(markup).toContain('aria-label="Colour"');
    expect(sliders(markup).map((s) => s.label)).toEqual([
      "Size",
      "Letter spacing",
      "Line spacing",
    ]);
  });

  it("shows what a part has by default, until her style says otherwise", () => {
    // a label is small capitals in the body font; its weight is semibold
    const label = toolbar({ part: "label" });
    expect(select(label, "Font")?.chosen).toEqual(["Body"]);
    expect(select(label, "Weight")?.chosen).toEqual(["Semibold"]);
    expect(button(label, "Capitals")?.pressed).toBe("true");
    expect(
      sliders(label).find((s) => s.label === "Letter spacing")?.value,
    ).toBe(0.12);

    const styled = toolbar({
      part: "title",
      recipe: {
        ...defaultRecipe(),
        styles: {
          title: {
            font: "body",
            weight: 800,
            upper: true,
            align: "right",
            scale: 1.5,
          },
        },
      },
    });
    expect(select(styled, "Font")?.chosen).toEqual(["Body"]);
    expect(select(styled, "Weight")?.chosen).toEqual(["Extra bold"]);
    expect(button(styled, "Capitals")?.pressed).toBe("true");
    expect(button(styled, "Right")?.pressed).toBe("true");
    expect(button(styled, "Left")?.pressed).toBe("false");
    expect(sliders(styled).find((s) => s.label === "Size")?.value).toBe(1.5);
  });

  it("centres a title-only cover's words by default, but not a text layer's", () => {
    const recipe = { ...defaultRecipe(), layout: "title" as const };
    expect(button(toolbar({ part: "title", recipe }), "Centre")?.pressed).toBe(
      "true",
    );
    const layer = { ...recipe, extras: [text("x1")] };
    expect(
      button(toolbar({ extra: layer.extras[0], recipe: layer }), "Left")
        ?.pressed,
    ).toBe("true");
  });

  it("sets a text layer she added the same way, and orders, duplicates and deletes it", () => {
    const recipe = {
      ...defaultRecipe(),
      extras: [text("x1"), text("x2", { style: { weight: 800 } })],
    };
    const first = toolbar({ extra: recipe.extras[0], recipe });
    expect(select(first, "Font")?.chosen).toEqual(["Body"]);
    expect(select(first, "Weight")?.chosen).toEqual(["Semibold"]);
    expect(button(first, "Send back")?.disabled).toBe(true);
    expect(button(first, "Bring forward")?.disabled).toBe(false);
    expect(button(first, "Duplicate")?.disabled).toBe(false);
    expect(button(first, "Delete")).not.toBeNull();

    const last = toolbar({ extra: recipe.extras[1], recipe });
    expect(select(last, "Weight")?.chosen).toEqual(["Extra bold"]);
    expect(button(last, "Bring forward")?.disabled).toBe(true);
    expect(button(last, "Send back")?.disabled).toBe(false);
  });

  it("cannot duplicate a layer once she has twelve, and offers a fixed part neither order nor copy", () => {
    const full = {
      ...defaultRecipe(),
      extras: Array.from({ length: 12 }, (_, i) => text(`x${i + 1}`)),
    };
    expect(
      button(toolbar({ extra: full.extras[3], recipe: full }), "Duplicate")
        ?.disabled,
    ).toBe(true);
    const fixed = toolbar({ part: "title" });
    for (const name of ["Duplicate", "Bring forward", "Send back"]) {
      expect(button(fixed, name), name).toBeNull();
    }
    expect(button(fixed, "Delete")).not.toBeNull();
  });
});

describe("LayerToolbar: the photo", () => {
  it("sets its focus and zoom; its light and colour are in the Edit photo drawer", () => {
    const recipe: CoverRecipe = {
      ...defaultRecipe({ photoId: "p" }),
      photo: {
        id: "p",
        focus: [0.25, 0.75],
        zoom: 1.5,
        brightness: 1.1,
        contrast: 0.9,
        saturation: 1.2,
        darken: 0.3,
      },
    };
    expect(sliders(toolbar({ part: "photo", recipe }))).toEqual([
      { label: "Focus across", min: 0, max: 1, step: 0.01, value: 0.25 },
      { label: "Focus down", min: 0, max: 1, step: 0.01, value: 0.75 },
      { label: "Zoom", min: 1, max: 3, step: 0.05, value: 1.5 },
    ]);
  });
});

describe("LayerToolbar: badges, shapes, the colour and the logo", () => {
  it("the fixed badge picks its kind, leaving out what its target could never draw", () => {
    const recipe = {
      ...defaultRecipe(),
      badge: { kind: "live" as const, text: "", fill: "accent" as const },
    };
    expect(
      select(toolbar({ part: "badge", recipe, targetKind: "course" }), "Show"),
    ).toEqual({
      labels: ["None", "New", "Live", "Your words"],
      chosen: ["Live"],
    });
    expect(
      select(toolbar({ part: "badge", recipe, targetKind: "zoom" }), "Show")
        ?.labels,
    ).toEqual(["None", "Next date", "Live", "Your words"]);
    // no field for words unless the kind is her own words
    expect(
      toolbar({ part: "badge", recipe, targetKind: "course" }),
    ).not.toContain('aria-label="Badge words"');
    expect(toolbar({ part: "badge", recipe, targetKind: "course" })).toContain(
      'aria-label="Fill"',
    );
  });

  it("a badge of her own words has a field for them, up to 24 characters", () => {
    const recipe = {
      ...defaultRecipe(),
      badge: {
        kind: "text" as const,
        text: "Starts Monday",
        fill: "accent" as const,
      },
    };
    const markup = toolbar({ part: "badge", recipe, targetKind: "course" });
    expect(markup).toMatch(
      /aria-label="Badge words"[^>]*value="Starts Monday"/,
    );
    expect(markup).toContain('maxLength="24"');
    // and a badge layer she added has them always, and no kind
    const own = { ...defaultRecipe(), extras: [badge("x1")] };
    const added = toolbar({ extra: own.extras[0], recipe: own });
    expect(added).toMatch(/aria-label="Badge words"[^>]*value="Sold out"/);
    expect(select(added, "Show")).toBeNull();
  });

  it("the fixed badge has a size, from the range the server keeps, and a badge she added has none", () => {
    const recipe = {
      ...defaultRecipe(),
      badge: { kind: "live" as const, text: "", fill: "accent" as const },
    };
    expect(sliders(toolbar({ part: "badge", recipe }))).toEqual([
      { label: "Size", min: 0.5, max: 2, step: 0.05, value: 1 },
    ]);
    // her own size is what the slider shows
    const sized = { ...recipe, styles: { badge: { scale: 1.5 } } };
    expect(sliders(toolbar({ part: "badge", recipe: sized }))[0].value).toBe(
      1.5,
    );
    // a badge layer she added has no style to hold one
    const own = { ...defaultRecipe(), extras: [badge("x1")] };
    expect(sliders(toolbar({ extra: own.extras[0], recipe: own }))).toEqual([]);
  });

  it("a shape picks its form, fill and opacity", () => {
    const recipe = { ...defaultRecipe(), extras: [shape("x1")] };
    const markup = toolbar({ extra: recipe.extras[0], recipe });
    expect(select(markup, "Shape")).toEqual({
      labels: [
        "Rectangle",
        "Circle",
        "Arch",
        "Line",
        "Pill",
        "Star",
        "Burst",
        "Arrow",
      ],
      chosen: ["Arch"],
    });
    expect(markup).toContain('aria-label="Fill"');
    expect(sliders(markup)).toEqual([
      { label: "Opacity", min: 0.1, max: 1, step: 0.05, value: 0.8 },
    ]);
  });

  it("the colour panel picks a colour and has no Delete: it is the cover's ground, she only changes its colour", () => {
    const panel = toolbar({ part: "panel" });
    expect(panel).toContain('aria-label="Colour"');
    expect(sliders(panel)).toEqual([]);
    expect(button(panel, "Delete")).toBeNull();
    // the other fixed parts, the logo and the badge among them, keep theirs
    for (const part of PARTS.filter((one) => one !== "panel")) {
      expect(
        button(toolbar({ part, targetKind: "course" }), "Delete"),
        part,
      ).not.toBeNull();
    }

    const none = toolbar({ part: "logo" });
    expect(none).toMatch(/aria-pressed="true"[^>]*>Automatic</);
    const white = toolbar({
      part: "logo",
      recipe: { ...defaultRecipe(), styles: { logo: { color: "white" } } },
    });
    expect(white).toMatch(/aria-pressed="true"[^>]*>White</);
    const own = toolbar({
      part: "logo",
      recipe: { ...defaultRecipe(), styles: { logo: { color: "accent" } } },
    });
    expect(own).toMatch(/aria-pressed="true"[^>]*>Original</);
  });

  it("shows nothing when nothing is selected", () => {
    expect(toolbar({})).toBe("");
  });
});

describe("LayerToolbar: every slider stays inside the ranges the server keeps", () => {
  it("takes its ends from RANGES", () => {
    const { frame: sides, ...others } = RANGES;
    const allowed = new Set(
      [...Object.values(others), ...Object.values(sides)].map((range) =>
        range.join(","),
      ),
    );
    const recipe: CoverRecipe = {
      ...defaultRecipe({ photoId: "p" }),
      extras: [text("x1"), shape("x2")],
    };
    const markup = [
      toolbar({ part: "title", recipe }),
      toolbar({ part: "photo", recipe }),
      toolbar({ extra: recipe.extras[0], recipe }),
      toolbar({ extra: recipe.extras[1], recipe }),
      toolbar({ part: "badge", recipe }),
    ].join("");
    const found = sliders(markup);
    // the title's three, the photo's three, the text layer's three, the shape's and the badge's
    expect(found.length).toBeGreaterThanOrEqual(11);
    for (const { label, min, max } of found) {
      expect(allowed.has(`${min},${max}`), `${label}: ${min}-${max}`).toBe(
        true,
      );
    }
  });
});

describe("TEXT_DEFAULTS", () => {
  // The toolbar shows what a part is set in when her style says nothing; CoverArt sets it, so they
  // must agree. cover-art.tsx is not exported from, so its table is read from the source.
  const source = readFileSync(
    path.resolve(__dirname, "../../covers/cover-art.tsx"),
    "utf8",
  );
  const start = source.indexOf("const TYPE: Record<");
  const table = source.slice(
    source.indexOf("> = {", start),
    source.indexOf("\n};", start),
  );

  it.each(["label", "title", "subtitle", "extra"] as const)(
    "matches how CoverArt sets a %s",
    (kind) => {
      const m = new RegExp(
        `\\b${kind}: \\{\\s*font: "(\\w+)",\\s*weight: (\\d+),\\s*upper: (true|false),\\s*tracking: (-?[\\d.]+),\\s*leading: ([\\w.]+),`,
      ).exec(table);
      expect(m, `${kind} is in cover-art.tsx`).not.toBeNull();
      const [, font, weight, upper, tracking, leading] = m!;
      const resolved = leading.startsWith("LEADING.")
        ? LEADING[leading.slice(8) as keyof typeof LEADING]
        : Number(leading);
      expect(TEXT_DEFAULTS[kind]).toEqual({
        font,
        weight: Number(weight),
        upper: upper === "true",
        tracking: Number(tracking),
        leading: resolved,
      });
    },
  );
});

describe("LayerToolbar: effects, marked words, the flip and the new layers", () => {
  it("puts the effect and the coloured word in one Effects menu, which names what is on", () => {
    // one button, whatever is chosen: the toolbar keeps its row, so the canvas under it never moves
    const plain = toolbar({ part: "title", itemTitle: "Morning flow" });
    expect(plain.match(/aria-label="Effects"/g)).toHaveLength(1);
    expect(select(plain, "Effect")).toBeNull();
    expect(select(plain, "Colour a word")).toBeNull();
    expect(plain).toMatch(/aria-label="Effects"[^>]*>[\s\S]*?Effects/);
    const recipe = {
      ...defaultRecipe(),
      words: { label: "", title: "Morning *flow*", subtitle: "" },
      styles: { title: { effect: "highlight" as const } },
    };
    const on = toolbar({ part: "title", recipe });
    expect(on.match(/aria-label="Effects"/g)).toHaveLength(1);
    expect(on).toMatch(/Highlight<span[^>]*>· flow<\/span>/);
  });

  it("flips the photo and opens Edit photo", () => {
    const recipe = defaultRecipe({ photoId: "p" });
    expect(button(toolbar({ part: "photo", recipe }), "Flip")).not.toBeNull();
    expect(toolbar({ part: "photo", recipe })).not.toContain("Edit photo");
    expect(toolbar({ part: "photo", recipe, onEditPhoto: vi.fn() })).toContain(
      "Edit photo",
    );
  });

  it("an icon picks its icon, colour and opacity; a QR code its link and two colours", () => {
    const icon: Extra = {
      id: "i1",
      type: "icon",
      icon: "calendar",
      fill: "accent",
      opacity: 1,
      frame,
    };
    const iconBar = toolbar({
      extra: icon,
      recipe: { ...defaultRecipe(), extras: [icon] },
    });
    expect(select(iconBar, "Icon")?.chosen).toEqual(["Calendar"]);
    expect(select(iconBar, "Icon")?.labels).toHaveLength(40);
    expect(sliders(iconBar)).toEqual([
      { label: "Opacity", min: 0.1, max: 1, step: 0.05, value: 1 },
    ]);
    const qr: Extra = {
      id: "q1",
      type: "qr",
      text: "https://yoga.test/courses/flow",
      fill: "black",
      back: "white",
      frame,
    };
    const qrBar = toolbar({
      extra: qr,
      recipe: { ...defaultRecipe(), extras: [qr] },
    });
    expect(qrBar).toContain('aria-label="Link"');
    expect(qrBar).toContain('value="https://yoga.test/courses/flow"');
    expect(qrBar).toContain('aria-label="Colour of the squares"');
    expect(qrBar).toContain('aria-label="Colour behind the squares"');
  });
});

describe("isQrLink", () => {
  it("takes a web address and nothing else", () => {
    expect(isQrLink("https://yoga.test/courses/flow")).toBe(true);
    expect(isQrLink("http://yoga.test")).toBe(true);
    for (const bad of [
      "yoga.test",
      "javascript:alert(1)",
      "https://a b",
      "",
      `https://${"a".repeat(300)}`,
    ]) {
      expect(isQrLink(bad), bad).toBe(false);
    }
  });
});
