import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  BrandDrawer,
  fontTarget,
  paintTarget,
} from "@/components/studio/drawers/brand";
import {
  badgeKindEdit,
  ElementsDrawer,
} from "@/components/studio/drawers/elements";
import { LayoutsDrawer } from "@/components/studio/drawers/layouts";
import { PhotosDrawer } from "@/components/studio/drawers/photos";
import { TextDrawer } from "@/components/studio/drawers/text";
import { UploadsDrawer } from "@/components/studio/drawers/uploads";
import { applyEdit } from "@/lib/covers/editor";
import { newShapeExtra, newTextExtra } from "@/lib/covers/new-layers";
import { defaultRecipe, framesFor } from "@/lib/covers/recipe";
import { siteLook } from "@/lib/site-styles";
import { MAX_EXTRAS } from "@/types/design";
import type { CoverRecipe } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(Intl, { locale: "en", messages }, node));

const fonts = siteLook("journal").fonts;
const edit = vi.fn();

/** A recipe with every layer there is room for: `n` text extras. */
function withExtras(n: number): CoverRecipe {
  let recipe = defaultRecipe();
  for (let i = 0; i < n; i++) {
    recipe = applyEdit(recipe, {
      type: "addExtra",
      extra: newTextExtra(recipe, "line", 1, `Line ${i}`),
    });
  }
  return recipe;
}

const headings = (markup: string) =>
  [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

describe("LayoutsDrawer", () => {
  const drawer = (
    over: { recipe?: CoverRecipe; set?: CoverRecipe | null } = {},
  ) =>
    render(
      createElement(LayoutsDrawer, {
        recipe: over.recipe ?? defaultRecipe(),
        set: over.set ?? null,
        edit,
      }),
    );

  it("offers the six layouts by name, two across, and marks the one she is on", () => {
    const markup = drawer({ recipe: { ...defaultRecipe(), layout: "band" } });
    for (const name of [
      "Colour panel",
      "Full photo",
      "Title only",
      "Colour band",
      "Framed photo",
      "Photo only",
    ]) {
      expect(markup).toContain(name);
    }
    expect(markup).toContain("grid-cols-2");
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Colour band/,
    );
  });

  it("shows Your set first, and only when she has a kept cover", () => {
    expect(drawer()).not.toContain("Your set");
    const markup = drawer({ set: { ...defaultRecipe(), layout: "framed" } });
    expect(markup.indexOf("Your set")).toBeLessThan(
      markup.indexOf("Colour panel"),
    );
  });
});

describe("PhotosDrawer", () => {
  it("wraps the photo sources under a Photo heading, on the tab it is given", () => {
    const markup = render(
      createElement(PhotosDrawer, {
        cardAspect: "4/5",
        inUse: {},
        generationsLeft: 3,
        onPick: vi.fn(),
        tab: "new",
      }),
    );
    expect(headings(markup)).toEqual(["Photo"]);
    expect(markup).toContain("Describe the photo");
  });
});

describe("TextDrawer", () => {
  const drawer = (recipe = defaultRecipe(), look = "journal") =>
    render(
      createElement(TextDrawer, {
        recipe,
        itemTitle: "Yoga for Beginners",
        targetKind: "course",
        look,
        aspect: 4 / 5,
        edit,
        onSelect: vi.fn(),
      }),
    );

  it("adds a title, a subtitle and a line of text, then lists the cover's own words", () => {
    const markup = drawer();
    expect(headings(markup)).toEqual(["Add text", "Words"]);
    const order = ["Add a title", "Add a subtitle", "Add a line of text"].map(
      (name) => markup.indexOf(name),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // the words keep the item's title as their placeholder
    expect(markup).toContain('placeholder="Yoga for Beginners"');
  });

  it("sets the title's button in the look's display font and the others in its body font", () => {
    const markup = drawer();
    const button = (name: string) =>
      markup.match(new RegExp(`<button[^>]*>${name}</button>`))![0];
    expect(button("Add a title")).toContain(fonts.display);
    expect(button("Add a subtitle")).toContain(fonts.body);
    expect(button("Add a line of text")).toContain(fonts.body);
  });

  it("holds the adding when the cover has all the layers it can", () => {
    const some = drawer(withExtras(MAX_EXTRAS - 1));
    expect(some).not.toMatch(/disabled=""[^>]*>Add a title/);
    expect(some).not.toContain("can hold");
    const full = drawer(withExtras(MAX_EXTRAS));
    for (const name of [
      "Add a title",
      "Add a subtitle",
      "Add a line of text",
    ]) {
      expect(full).toMatch(new RegExp(`disabled=""[^>]*>${name}<`));
    }
    expect(full).toContain("A cover can hold 12 added layers.");
  });
});

describe("ElementsDrawer", () => {
  const drawer = (targetKind: string, recipe = defaultRecipe()) =>
    render(
      createElement(ElementsDrawer, {
        recipe,
        targetKind,
        aspect: 16 / 9,
        edit,
        onSelect: vi.fn(),
      }),
    );
  const pills = (markup: string) =>
    [
      ...markup.matchAll(/<button[^>]*rounded-full[^>]*>([^<]*)<\/button>/g),
    ].map((m) => m[1]);

  it("offers a course New and Live, and an event Next date and Live, and her own words to both", () => {
    expect(pills(drawer("course"))).toEqual(["New", "Live", "Your words"]);
    expect(pills(drawer("live"))).toEqual(["Next date", "Live", "Your words"]);
  });

  it("marks the badge the cover shows now", () => {
    const live = drawer("course", {
      ...defaultRecipe(),
      badge: { kind: "live", text: "", fill: "accent" },
    });
    expect(live).toMatch(/aria-pressed="true"[^>]*>Live</);
    expect(live.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(drawer("course")).not.toContain('aria-pressed="true"');
  });

  it("keeps the badge kind she has even when it could not be offered", () => {
    const stale = drawer("course", {
      ...defaultRecipe(),
      badge: { kind: "date", text: "", fill: "accent" },
    });
    expect(pills(stale)).toContain("Next date");
  });

  describe("a badge she deleted on the canvas", () => {
    const shown: CoverRecipe = {
      ...defaultRecipe(),
      badge: { kind: "live", text: "", fill: "accent" },
    };
    const deleted: CoverRecipe = applyEdit(shown, {
      type: "remove",
      id: "badge",
    });

    it("is not drawn, so no pill shows as pressed", () => {
      expect(framesFor(deleted, "card", "4/5").badge).toBeUndefined();
      expect(drawer("course", deleted)).not.toContain('aria-pressed="true"');
      // and one that is drawn still shows its kind
      expect(drawer("course", shown)).toMatch(/aria-pressed="true"[^>]*>Live</);
    });

    it("comes back with any pill, the kind it had too", () => {
      for (const kind of ["new", "live"] as const) {
        const change = badgeKindEdit(deleted, kind);
        expect(change).toEqual({ type: "badge", patch: { kind } });
        const after = applyEdit(deleted, change!);
        expect(after.badge.kind).toBe(kind);
        expect(after.styles.badge?.hidden).toBeUndefined();
        expect(framesFor(after, "card", "4/5").badge).toBeDefined();
      }
    });

    it("changes nothing when she taps the kind the cover shows", () => {
      expect(badgeKindEdit(shown, "live")).toBeNull();
      expect(badgeKindEdit(shown, "new")).toEqual({
        type: "badge",
        patch: { kind: "new" },
      });
    });
  });

  it("offers the four shapes", () => {
    const markup = drawer("course");
    expect(headings(markup)).toEqual(["Badge", "Shapes"]);
    for (const name of ["Rectangle", "Circle", "Arch", "Line"]) {
      expect(markup).toContain(name);
    }
  });

  it("holds the adding of layers of her own when the cover has all it can", () => {
    const full = drawer("course", withExtras(MAX_EXTRAS));
    expect(full).toMatch(/disabled=""[^>]*>Your words</);
    expect((full.match(/disabled=""/g) ?? []).length).toBe(5);
    expect(full).toContain("A cover can hold 12 added layers.");
    // the kinds of the cover's own badge are not layers: they stay open
    expect(full).not.toMatch(/disabled=""[^>]*>New</);
    expect(full).not.toMatch(/disabled=""[^>]*>Live</);
  });
});

describe("paintTarget", () => {
  const recipe = (): CoverRecipe => {
    let r = defaultRecipe();
    r = applyEdit(r, {
      type: "addExtra",
      extra: {
        ...newTextExtra(r, "title", 1, "Hi"),
        style: { color: "accent" },
      },
    });
    r = applyEdit(r, {
      type: "addExtra",
      extra: newShapeExtra(r, "circle", 1),
    });
    r = applyEdit(r, {
      type: "addExtra",
      extra: {
        id: "b1",
        type: "badge",
        text: "Sold out",
        fill: "ink",
        frame: { x: 0, y: 0, w: 0.2, h: 0.1 },
      },
    });
    return {
      ...r,
      panel: "paper",
      badge: { kind: "new", text: "", fill: "inverse" },
      styles: { title: { color: "white" } },
    };
  };

  it("colours the panel when nothing is selected, and when the layer has no colour of its own", () => {
    for (const selected of [null, "panel", "photo", "logo", "nobody"]) {
      const target = paintTarget(recipe(), selected);
      expect(target.what).toBe("panel");
      expect(target.current).toBe("paper");
      expect(target.apply("primary")).toEqual({
        type: "panel",
        paint: "primary",
      });
    }
  });

  it("has no colour while the panel is deleted, so any swatch brings it back, the colour it had too", () => {
    const deleted = applyEdit(
      { ...recipe(), panel: "accent" },
      { type: "remove", id: "panel" },
    );
    expect(framesFor(deleted, "card", "4/5").panel).toBeUndefined();
    for (const selected of [null, "panel", "photo"]) {
      const target = paintTarget(deleted, selected);
      expect(target.what).toBe("panel");
      expect(target.current).toBeUndefined();
      const after = applyEdit(deleted, target.apply("accent"));
      expect(after.panel).toBe("accent");
      expect(after.styles.panel?.hidden).toBeUndefined();
      expect(framesFor(after, "card", "4/5").panel).toBeDefined();
    }
  });

  it("colours the words of a part, with the colour it has now", () => {
    const target = paintTarget(recipe(), "title");
    expect(target.what).toBe("title");
    expect(target.current).toBe("white");
    expect(target.apply("accent")).toEqual({
      type: "style",
      part: "title",
      patch: { color: "accent" },
    });
    // a part she has not coloured has none yet
    expect(paintTarget(recipe(), "label").current).toBeUndefined();
  });

  it("fills the fixed badge", () => {
    const target = paintTarget(recipe(), "badge");
    expect(target.what).toBe("badge");
    expect(target.current).toBe("inverse");
    expect(target.apply("ink")).toEqual({
      type: "badge",
      patch: { fill: "ink" },
    });
  });

  it("colours a text layer's words, and fills a badge or a shape of her own", () => {
    const r = recipe();
    const [text, shape] = r.extras;
    const asText = paintTarget(r, text.id);
    expect(asText.what).toBe("text");
    expect(asText.current).toBe("accent");
    expect(asText.apply("black")).toEqual({
      type: "updateExtra",
      id: text.id,
      patch: { style: { color: "black" } },
    });
    const asShape = paintTarget(r, shape.id);
    expect(asShape.what).toBe("shape");
    expect(asShape.current).toBe("accent");
    expect(asShape.apply("primary")).toEqual({
      type: "updateExtra",
      id: shape.id,
      patch: { fill: "primary" },
    });
    const asBadge = paintTarget(r, "b1");
    expect(asBadge.what).toBe("badge");
    expect(asBadge.current).toBe("ink");
  });
});

describe("fontTarget", () => {
  it("goes to the selected words and text layers only", () => {
    let recipe = defaultRecipe();
    recipe = applyEdit(recipe, {
      type: "addExtra",
      extra: newTextExtra(recipe, "line", 1, "Hi"),
    });
    recipe = applyEdit(recipe, {
      type: "addExtra",
      extra: newShapeExtra(recipe, "rect", 1),
    });
    for (const selected of [
      null,
      "panel",
      "photo",
      "logo",
      "badge",
      "x2",
      "nobody",
    ]) {
      expect(fontTarget(recipe, selected)).toBeNull();
    }
    expect(fontTarget(recipe, "x1")?.apply("display")).toEqual({
      type: "updateExtra",
      id: "x1",
      patch: { style: { font: "display" } },
    });
    expect(fontTarget(recipe, "title")?.apply("body")).toEqual({
      type: "style",
      part: "title",
      patch: { font: "body" },
    });
  });

  it("starts from the font the layout gives, until she picks one", () => {
    const recipe = defaultRecipe();
    expect(fontTarget(recipe, "title")?.current).toBe("display");
    expect(fontTarget(recipe, "subtitle")?.current).toBe("body");
    expect(fontTarget(recipe, "label")?.current).toBe("body");
    const set: CoverRecipe = {
      ...recipe,
      styles: { subtitle: { font: "display" } },
    };
    expect(fontTarget(set, "subtitle")?.current).toBe("display");
  });
});

describe("BrandDrawer", () => {
  const drawer = (
    recipe = defaultRecipe(),
    selected: string | null = null,
    logoUrl: string | null = "https://x/logo.png",
  ) =>
    render(
      createElement(BrandDrawer, {
        recipe,
        look: "journal",
        logoUrl,
        selected,
        edit,
      }),
    );

  it("lists the logo, the colours and the fonts", () => {
    expect(headings(drawer())).toEqual(["Logo", "Colours", "Fonts"]);
  });

  it("reads the logo switch from the recipe, and disables it without a logo", () => {
    expect(drawer()).toMatch(/role="switch" aria-checked="true"/);
    expect(drawer(defaultRecipe(), null, null)).toMatch(
      /role="switch"[^>]*\sdisabled=""/,
    );
  });

  it("shows one swatch for each colour of the look, and the one the layer has pressed", () => {
    const markup = drawer({ ...defaultRecipe(), panel: "accent" });
    expect(
      markup.match(
        /<button[^>]*rounded-full[^>]*aria-label|aria-label="[^"]*"[^>]*rounded-full/g,
      ),
    ).toHaveLength(13);
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="Accent"/);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("presses no swatch while the panel is deleted, and the one it has is pressed again once it is back", () => {
    const panel = { ...defaultRecipe(), panel: "accent" as const };
    const deleted = applyEdit(panel, { type: "remove", id: "panel" });
    expect(drawer(deleted)).not.toContain('aria-pressed="true"');
    const back = applyEdit(deleted, paintTarget(deleted, null).apply("accent"));
    expect(drawer(back)).toMatch(/aria-pressed="true"[^>]*aria-label="Accent"/);
    // a layer with a colour of its own keeps its swatch whatever happens to the panel
    const title = applyEdit(deleted, {
      type: "style",
      part: "title",
      patch: { color: "white" },
    });
    expect(drawer(title, "title")).toMatch(
      /aria-pressed="true"[^>]*aria-label="White"/,
    );
  });

  it("reads the logo switch as off while the logo is deleted", () => {
    const deleted = applyEdit(defaultRecipe(), { type: "remove", id: "logo" });
    expect(drawer(deleted)).toMatch(/role="switch" aria-checked="false"/);
  });

  it("says what the colours change", () => {
    const base = defaultRecipe();
    const text = applyEdit(base, {
      type: "addExtra",
      extra: newTextExtra(base, "line", 1, "Hi"),
    });
    for (const [selected, recipe, said] of [
      [null, base, "These change the colour panel."],
      ["photo", base, "These change the colour panel."],
      ["title", base, "These change the title."],
      ["subtitle", base, "These change the subtitle."],
      ["badge", base, "These change the badge."],
      ["x1", text, "These change the selected text."],
    ] as const) {
      expect(drawer(recipe, selected)).toContain(said);
    }
  });

  it("names the look's two fonts, each in its own typeface", () => {
    const markup = drawer();
    expect(markup).toContain(fonts.display);
    expect(markup).toContain(fonts.body);
    expect(markup).toMatch(
      new RegExp(
        `font-family:[^"]*${fonts.display}[^"]*"[^>]*>${fonts.display}`,
      ),
    );
  });

  it("holds the fonts until text is selected, and says why", () => {
    const none = drawer();
    expect(none).toContain("Select some text on the cover to change its font.");
    expect(none.match(/disabled=""/g)).toHaveLength(2);
    const title = drawer(defaultRecipe(), "title");
    expect(title).not.toContain("Select some text");
    expect(title).not.toContain('disabled=""');
    // the title is set in the display font until she picks another
    expect(title).toMatch(
      new RegExp(`aria-pressed="true"[^>]*>${fonts.display}`),
    );
  });
});

describe("UploadsDrawer", () => {
  it("is a place to drop a photo, or to choose one", () => {
    const markup = render(createElement(UploadsDrawer, { onPick: vi.fn() }));
    expect(headings(markup)).toEqual(["Uploads"]);
    expect(markup).toContain("Drop a photo here");
    expect(markup).toContain("Choose a photo");
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"/);
  });

  it("cannot be used while the draft is being kept or replaced", () => {
    const markup = render(
      createElement(UploadsDrawer, { onPick: vi.fn(), disabled: true }),
    );
    expect(markup).toMatch(/disabled=""[^>]*>Choose a photo</);
  });
});
