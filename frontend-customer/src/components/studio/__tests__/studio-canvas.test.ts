import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  editsInPlace,
  layerWords,
  StudioCanvas,
  textEdit,
  type StudioCanvasProps,
} from "@/components/studio/studio-canvas";
import { editHistory } from "@/lib/covers/editor";
import { defaultRecipe, framesFor, sizeAspect } from "@/lib/covers/recipe";
import { createHistory } from "@/lib/logo/history";
import { TEXT_MAX } from "@/types/design";
import type { CoverItem, CoverRecipe, Extra, Frame } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
// createElement wants children among the props of this provider's own type; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  timeZone: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;

const PHOTO = "11111111-1111-4111-8111-111111111111";
const ITEM: CoverItem = {
  title: "Morning flow",
  createdAt: "2026-10-01T00:00:00Z",
};
const frame: Frame = { x: 0.1, y: 0.1, w: 0.4, h: 0.1 };
const text = (id: string): Extra => ({
  id,
  type: "text",
  text: `Words ${id}`,
  style: {},
  frame,
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
  shape: "circle",
  fill: "accent",
  opacity: 1,
  frame,
});
const withWords = (over: Partial<CoverRecipe> = {}): CoverRecipe => ({
  ...defaultRecipe({ photoId: PHOTO }),
  words: { label: "Course", title: null, subtitle: "Six weeks" },
  ...over,
});

function canvas(props: Partial<StudioCanvasProps> = {}) {
  const recipe = props.recipe ?? withWords();
  return renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages },
      createElement(StudioCanvas, {
        recipe,
        design: {
          id: "d1",
          photos: { [PHOTO]: "https://cdn.test/photo.jpg" },
          logo_url: "https://cdn.test/logo.png",
          look: "journal",
        },
        item: ITEM,
        size: "card",
        cardAspect: "4/5",
        selected: null,
        onSelect: vi.fn(),
        onEdit: vi.fn(),
        ...props,
      }),
    ),
  );
}

const handles = (markup: string) =>
  [...markup.matchAll(/data-handle="(\w+)"/g)].map((m) => m[1]);
/** The position the selection box was given, as the percentages it is written in. */
const selection = (markup: string) => {
  const m =
    /data-testid="selection-box"[^>]*style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/.exec(
      markup,
    );
  return m ? m.slice(1, 5).map(Number) : null;
};
const percent = (f: Frame) =>
  [f.x, f.y, f.w, f.h].map((v) => +(v * 100).toFixed(3));

describe("StudioCanvas", () => {
  it("draws the cover in the one size it is given, as a named picture, in that size's shape", () => {
    const markup = canvas({ size: "wide" });
    expect(markup).toMatch(/role="img" aria-label="Wide preview of the cover"/);
    expect(markup).toContain("data-cover");
    expect(markup).toContain('data-size="wide"');
    expect(markup).not.toContain('data-size="card"');
    expect(markup).not.toContain('data-size="banner"');
    expect(markup).toContain(`aspect-ratio:${16 / 9}`);
    expect(canvas({ size: "card" })).toContain(
      `aspect-ratio:${sizeAspect("card", "4/5")}`,
    );
    expect(canvas({ size: "banner" })).toContain("aspect-ratio:3");
  });

  it("is one place to stand on with the keyboard, and says what it is", () => {
    const markup = canvas();
    expect(markup).toContain('data-testid="studio-canvas"');
    expect(markup).toContain('role="application"');
    expect(markup).toContain('aria-label="Cover canvas"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toContain("aria-disabled");
  });

  it("selects nothing until a layer is selected", () => {
    const markup = canvas();
    expect(markup).not.toContain("selection-box");
    expect(handles(markup)).toEqual([]);
  });

  it("outlines the selected layer at its frame, with eight handles", () => {
    const recipe = withWords();
    const markup = canvas({ recipe, selected: "title" });
    expect(selection(markup)).toEqual(
      percent(framesFor(recipe, "card", "4/5").title),
    );
    expect(handles(markup).sort()).toEqual([
      "e",
      "n",
      "ne",
      "nw",
      "s",
      "se",
      "sw",
      "w",
    ]);
  });

  it("follows the frames of the size it draws, her own for that size included", () => {
    const moved: Frame = { x: 0.2, y: 0.3, w: 0.5, h: 0.2 };
    const recipe = withWords({ overrides: { banner: { title: moved } } });
    expect(
      selection(canvas({ recipe, size: "banner", selected: "title" })),
    ).toEqual(percent(moved));
    expect(
      selection(canvas({ recipe, size: "card", selected: "title" })),
    ).toEqual(percent(framesFor(recipe, "card", "4/5").title));
  });

  it("gives a logo its four corners, a badge none (fixed or her own), and a shape of hers eight", () => {
    const recipe = withWords({
      badge: { kind: "live", text: "", fill: "accent" },
      extras: [shape("x1"), badge("x2")],
    });
    expect(handles(canvas({ recipe, selected: "logo" })).sort()).toEqual([
      "ne",
      "nw",
      "se",
      "sw",
    ]);
    expect(handles(canvas({ recipe, selected: "badge" }))).toEqual([]);
    expect(selection(canvas({ recipe, selected: "badge" }))).not.toBeNull();
    expect(handles(canvas({ recipe, selected: "x2" }))).toEqual([]);
    expect(selection(canvas({ recipe, selected: "x2" }))).not.toBeNull();
    expect(handles(canvas({ recipe, selected: "x1" }))).toHaveLength(8);
  });

  it("draws nothing for a selected layer that is not there", () => {
    expect(selection(canvas({ selected: "x9" }))).toBeNull();
    // the badge is none: it has no frame
    expect(selection(canvas({ selected: "badge" }))).toBeNull();
  });

  it("holds the place of the photo while a new one is made", () => {
    const recipe = withWords();
    const photo = framesFor(recipe, "card", "4/5").photo;
    expect(canvas({ recipe })).not.toContain("animate-shimmer");
    const markup = canvas({ recipe, generating: true });
    expect(markup).toContain("animate-shimmer");
    expect(markup).toContain(`left:${percent(photo)[0]}%`);
  });

  it("does nothing while the draft is being kept or discarded", () => {
    const markup = canvas({ disabled: true });
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("pointer-events:none");
  });
});

describe("StudioCanvas: Delete and Backspace", () => {
  /** The canvas's key handler as the render gave it, and the callbacks it reports to. The component is
   *  called inside a Probe so that its hooks run; React would call the handler with the key event. */
  function keys(selected: string) {
    const onEdit = vi.fn();
    const onSelect = vi.fn();
    let onKeyDown: ((e: unknown) => void) | undefined;
    function Probe() {
      const root = StudioCanvas({
        recipe: withWords(),
        design: {
          id: "d1",
          photos: { [PHOTO]: "https://cdn.test/photo.jpg" },
          logo_url: null,
          look: "journal",
        },
        item: ITEM,
        size: "card",
        cardAspect: "4/5",
        selected,
        onSelect,
        onEdit,
      }) as ReactElement<{ onKeyDown: (e: unknown) => void }>;
      onKeyDown = root.props.onKeyDown;
      return null;
    }
    renderToStaticMarkup(
      createElement(
        Intl,
        { locale: "en", timeZone: "UTC", messages },
        createElement(Probe),
      ),
    );
    const press = (key: string) => {
      const event = {
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      onKeyDown?.(event);
      return event;
    };
    return { press, onEdit, onSelect };
  }

  it("takes away the selected layer and selects nothing", () => {
    for (const key of ["Delete", "Backspace"]) {
      const { press, onEdit, onSelect } = keys("subtitle");
      expect(press(key).preventDefault).toHaveBeenCalled();
      expect(onEdit).toHaveBeenCalledWith({ type: "remove", id: "subtitle" });
      expect(onSelect).toHaveBeenCalledWith(null);
    }
  });

  it("leaves the panel alone and selected: it is the cover's ground, and a click on the background selects it", () => {
    for (const key of ["Delete", "Backspace"]) {
      const { press, onEdit, onSelect } = keys("panel");
      // (the key is still hers: the browser does not step back a page for it)
      expect(press(key).preventDefault).toHaveBeenCalled();
      expect(onEdit).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    }
  });
});

describe("editsInPlace", () => {
  it("is for the words and her text layers, not the photo, logo, badge or shapes", () => {
    const recipe = withWords({
      extras: [text("x1"), badge("x2"), shape("x3")],
    });
    for (const id of ["label", "title", "subtitle", "x1"])
      expect(editsInPlace(recipe, id)).toBe(true);
    for (const id of ["photo", "panel", "logo", "badge", "x2", "x3", "ghost"]) {
      expect(editsInPlace(recipe, id), id).toBe(false);
    }
  });
});

describe("layerWords", () => {
  it("is the item's own title until she types another", () => {
    expect(layerWords(withWords(), ITEM, "title")).toBe("Morning flow");
    expect(
      layerWords(
        withWords({ words: { label: "", title: "Mine", subtitle: "" } }),
        ITEM,
        "title",
      ),
    ).toBe("Mine");
    expect(layerWords(withWords(), ITEM, "label")).toBe("Course");
    expect(layerWords(withWords({ extras: [text("x1")] }), ITEM, "x1")).toBe(
      "Words x1",
    );
    expect(layerWords(withWords(), ITEM, "logo")).toBe("");
  });
});

describe("textEdit", () => {
  const recipe = withWords({ extras: [text("x1"), badge("x2")] });

  it("types words into the part they belong to", () => {
    expect(textEdit(recipe, "label", "4 weeks", "Course")).toEqual({
      type: "words",
      patch: { label: "4 weeks" },
    });
    expect(
      textEdit(recipe, "subtitle", "Six weeks of calm", "Six weeks"),
    ).toEqual({
      type: "words",
      patch: { subtitle: "Six weeks of calm" },
    });
    expect(textEdit(recipe, "title", "Calm mornings", "Morning flow")).toEqual({
      type: "words",
      patch: { title: "Calm mornings" },
    });
  });

  it("changes nothing when the words are as they were, so a title that follows the item keeps following it", () => {
    expect(
      textEdit(recipe, "title", "Morning flow", "Morning flow"),
    ).toBeNull();
    expect(
      textEdit(recipe, "title", "  Morning   flow ", "Morning flow"),
    ).toBeNull();
    expect(textEdit(recipe, "label", "Course", "Course")).toBeNull();
  });

  it("leaves a title longer than a cover keeps as it is when she types nothing: it is not cut, and keeps following the item", () => {
    const long = `${"abcd ".repeat(24).slice(0, 119)}z`;
    expect(long).toHaveLength(120);
    expect(long.length).toBeGreaterThan(TEXT_MAX.title);
    // the field gives back what it showed, the browser's spaces among it
    expect(textEdit(recipe, "title", long, long)).toBeNull();
    expect(
      textEdit(recipe, "title", ` ${long.replace(/ /g, "  ")}\n`, long),
    ).toBeNull();
    // a text layer and a subtitle are cut at their own lengths, and also left alone
    const longer = "b".repeat(TEXT_MAX.subtitle + 30);
    expect(textEdit(recipe, "subtitle", longer, longer)).toBeNull();
    // and it is not what she changes that decides it: a change sends the cut words
    expect(textEdit(recipe, "title", `New ${long}`, long)).toEqual({
      type: "words",
      patch: { title: `New ${long}`.slice(0, TEXT_MAX.title).trimEnd() },
    });
    // the history has no step for it: nothing is sent, so nothing is pushed
    const before = withWords();
    const history = createHistory(before);
    const sent = textEdit(before, "title", long, long);
    expect(sent === null ? history : editHistory(history, sent)).toBe(history);
    expect(layerWords(before, { ...ITEM, title: long }, "title")).toBe(long);
  });

  it("sends an emptied title, which then follows the item again, and empties a label or subtitle", () => {
    expect(textEdit(recipe, "title", "", "Mine")).toEqual({
      type: "words",
      patch: { title: "" },
    });
    expect(textEdit(recipe, "title", " \n ", "Mine")).toEqual({
      type: "words",
      patch: { title: "" },
    });
    expect(textEdit(recipe, "subtitle", "", "Six weeks")).toEqual({
      type: "words",
      patch: { subtitle: "" },
    });
  });

  it("keeps the words on one line, and within the length the server keeps", () => {
    expect(textEdit(recipe, "title", "Two\nlines here", "x")).toEqual({
      type: "words",
      patch: { title: "Two lines here" },
    });
    const long = "a".repeat(200);
    expect(textEdit(recipe, "label", long, "x")).toEqual({
      type: "words",
      patch: { label: "a".repeat(40) },
    });
    expect(textEdit(recipe, "title", long, "x")).toEqual({
      type: "words",
      patch: { title: "a".repeat(90) },
    });
    expect(textEdit(recipe, "subtitle", long, "x")).toEqual({
      type: "words",
      patch: { subtitle: "a".repeat(140) },
    });
    expect(textEdit(recipe, "x1", long, "x")).toEqual({
      type: "updateExtra",
      id: "x1",
      patch: { text: "a".repeat(140) },
    });
    expect(textEdit(recipe, "x2", long, "x")).toEqual({
      type: "updateExtra",
      id: "x2",
      patch: { text: "a".repeat(24) },
    });
  });

  it("types into a layer of hers, and takes away one she emptied", () => {
    expect(textEdit(recipe, "x1", "Starts Monday", "Words x1")).toEqual({
      type: "updateExtra",
      id: "x1",
      patch: { text: "Starts Monday" },
    });
    expect(textEdit(recipe, "x1", "Words x1", "Words x1")).toBeNull();
    expect(textEdit(recipe, "x1", "  ", "Words x1")).toEqual({
      type: "remove",
      id: "x1",
    });
  });

  it("knows no other layer", () => {
    for (const id of ["photo", "logo", "badge", "panel", "ghost"]) {
      expect(textEdit(recipe, id, "x", "y"), id).toBeNull();
    }
  });

  it("keeps Turkish letters as they are typed", () => {
    expect(textEdit(recipe, "title", "Güçlü Başlangıç İçin", "x")).toEqual({
      type: "words",
      patch: { title: "Güçlü Başlangıç İçin" },
    });
  });
});
