import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { PhotoSources } from "@/components/studio/photo-sources";
import {
  SimpleControls,
  type SimpleControlsProps,
} from "@/components/studio/simple-controls";
import { applyEdit } from "@/lib/covers/editor";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { CoverRecipe } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
// createElement wants children among the props of this provider's own type; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(Intl, { locale: "en", messages }, node));

const photoSources = {
  cardAspect: "4/5" as const,
  inUse: {},
  generationsLeft: 5,
  onPick: vi.fn(),
};

function controls(over: Partial<SimpleControlsProps> = {}) {
  return render(
    createElement(SimpleControls, {
      recipe: defaultRecipe(),
      targetKind: "course",
      itemTitle: "Yoga for Beginners",
      look: "journal",
      logoUrl: "https://x/logo.png",
      set: null,
      size: "card",
      onSize: vi.fn(),
      edit: vi.fn(),
      photoSources,
      ...over,
    }),
  );
}

const headings = (markup: string) =>
  [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

describe("SimpleControls", () => {
  it("lists its sections in order: words, photo, layout, colour, badge, logo, size", () => {
    expect(headings(controls())).toEqual([
      "Words",
      "Photo",
      "Layout",
      "Colour",
      "Badge",
      "Logo",
      "Size",
    ]);
  });

  it("offers the six layouts by name, and marks the one she is on", () => {
    const markup = controls({
      recipe: { ...defaultRecipe(), layout: "band" },
    });
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
    expect(
      markup.match(
        /aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Colour band/,
      ),
    ).not.toBeNull();
  });

  it("shows Your set only when she has a kept cover", () => {
    expect(controls()).not.toContain("Your set");
    const kept: CoverRecipe = { ...defaultRecipe(), layout: "framed" };
    const markup = controls({ set: kept });
    expect(markup).toContain("Your set");
    // it comes before the six layouts
    expect(markup.indexOf("Your set")).toBeLessThan(
      markup.indexOf("Colour panel"),
    );
  });

  it("follows the item's title until she types one: the title field's placeholder is the item's", () => {
    const empty = controls();
    expect(empty).toContain('placeholder="Yoga for Beginners"');
    expect(empty).toMatch(/id="[^"]*-title"[^>]*value=""/);
    const typed = controls({
      recipe: {
        ...defaultRecipe(),
        words: { label: "", title: "Morning flow", subtitle: "" },
      },
    });
    expect(typed).toContain('value="Morning flow"');
  });

  it("suggests a label that suits the target: a course's is about weeks, an event's about the class", () => {
    const label = (markup: string) =>
      /id="[^"]*-label"[^>]*placeholder="([^"]*)"/.exec(markup)?.[1];
    expect(label(controls({ targetKind: "course" }))).toBe(
      "e.g. 4-week course",
    );
    for (const targetKind of ["live", "zoom", "in_person"]) {
      expect(label(controls({ targetKind })), targetKind).toBe(
        "e.g. Live session",
      );
    }
  });

  it("limits the words to the lengths the server keeps", () => {
    const markup = controls();
    expect(markup).toContain('maxLength="40"');
    expect(markup).toContain('maxLength="90"');
    expect(markup).toContain('maxLength="140"');
  });

  it("offers a course New and no date, and an event the date and not New", () => {
    const course = controls({ targetKind: "course" });
    expect(course).toContain(">New</option>");
    expect(course).not.toContain(">Next date</option>");
    const event = controls({ targetKind: "live" });
    expect(event).toContain(">Next date</option>");
    expect(event).not.toContain(">New</option>");
    for (const markup of [course, event]) {
      expect(markup).toContain(">None</option>");
      expect(markup).toContain(">Live</option>");
      expect(markup).toContain(">Your words</option>");
    }
  });

  it("asks for badge words only when the badge is her own words", () => {
    expect(controls()).not.toContain("Badge words");
    const text = controls({
      recipe: {
        ...defaultRecipe(),
        badge: { kind: "text", text: "Starts Monday", fill: "accent" },
      },
    });
    expect(text).toContain("Badge words");
    expect(text).toContain('maxLength="24"');
    expect(text).toContain('value="Starts Monday"');
  });

  it("reads the logo switch from the recipe, and disables it without a logo", () => {
    const on = controls();
    expect(on).toMatch(/role="switch" aria-checked="true"/);
    const hidden = controls({
      recipe: { ...defaultRecipe(), styles: { logo: { hidden: true } } },
    });
    expect(hidden).toMatch(/role="switch" aria-checked="false"/);
    const none = controls({ logoUrl: null });
    expect(none).toMatch(/role="switch"[^>]*\sdisabled=""/);
    expect(on).not.toMatch(/role="switch"[^>]*\sdisabled=""/);
    expect(none).toContain("You haven&#x27;t added a logo yet.");
  });

  it("shows the palette of the look as swatches, and the colour she has set", () => {
    const markup = controls({
      recipe: { ...defaultRecipe(), panel: "accent" },
    });
    // one swatch for each of the 13 roles
    expect(
      markup.match(
        /aria-label="(Main colour|Accent|Text|Background|Surface|Dark|Text on dark|Main colour, lighter|Main colour, darker|Accent, lighter|Accent, darker|White|Black)"/g,
      ),
    ).toHaveLength(13);
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="Accent"/);
    const hex = controls({
      recipe: { ...defaultRecipe(), panel: "#1E5AA8" },
    });
    expect(hex).toContain('value="#1E5AA8"');
  });

  describe("a panel an older draft deleted on the canvas", () => {
    // (Delete no longer takes the panel away, but a draft saved before still has it hidden)
    const deleted = (panel: CoverRecipe["panel"]): CoverRecipe => ({
      ...defaultRecipe(),
      panel,
      styles: { panel: { hidden: true } },
    });

    it("has no swatch pressed, so every one brings it back, the colour it had too", () => {
      const kept = controls({
        recipe: { ...defaultRecipe(), panel: "accent" },
      });
      expect(kept).toMatch(/aria-pressed="true"[^>]*aria-label="Accent"/);
      expect(controls({ recipe: deleted("accent") })).not.toMatch(
        /aria-pressed="true"[^>]*aria-label="(Main colour|Accent|Text|Background|Surface|Dark|Text on dark|Main colour, lighter|Main colour, darker|Accent, lighter|Accent, darker|White|Black)"/,
      );
    });

    it("leaves the colour field empty, though its colour was a hex", () => {
      const markup = controls({ recipe: deleted("#C0FFEE") });
      expect(markup).not.toContain("#C0FFEE");
      expect(markup).toMatch(/<input[^>]*placeholder="#1E5AA8"[^>]*value=""/);
    });
  });

  describe("a badge she deleted on the canvas", () => {
    const options = (markup: string) =>
      markup.match(/<select[^>]*>[\s\S]*?<\/select>/)![0];
    const withBadge = (kind: "new" | "live") =>
      applyEdit(
        { ...defaultRecipe(), badge: { ...defaultRecipe().badge, kind } },
        { type: "badge", patch: { kind } },
      );

    it("shows the kind it has, while it is drawn", () => {
      const markup = options(controls({ recipe: withBadge("live") }));
      expect(markup).not.toContain("Deleted from the cover");
      expect(markup).toMatch(/<option[^>]*value="live"[^>]*selected/);
      expect(markup.match(/selected/g)).toHaveLength(1);
    });

    it("shows none of the kinds, so that choosing one, its own too, brings it back", () => {
      const recipe = applyEdit(withBadge("live"), {
        type: "remove",
        id: "badge",
      });
      const markup = options(controls({ recipe }));
      expect(markup).toMatch(
        /<option(?=[^>]*value="")(?=[^>]*disabled)(?=[^>]*selected)[^>]*>Deleted from the cover<\/option>/,
      );
      expect(markup.match(/selected/g)).toHaveLength(1);
      expect(markup).toContain('value="live"');
      // choosing the kind it had is a change of the select's value, so it fires
      const back = applyEdit(recipe, {
        type: "badge",
        patch: { kind: "live" },
      });
      expect(options(controls({ recipe: back }))).toMatch(
        /<option[^>]*value="live"[^>]*selected/,
      );
    });
  });

  it("marks the size shown large, with the shape of each", () => {
    const markup = controls({ size: "wide" });
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Wide<span[^>]*>16:9/);
    expect(markup).toContain("Card");
    expect(markup).toContain("4:5");
    expect(markup).toContain("3:1");
  });
});

describe("PhotoSources", () => {
  it("opens on Yours, with Contentor and New beside it", () => {
    const markup = render(createElement(PhotoSources, photoSources));
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Yours</);
    expect(markup).toMatch(
      /role="tab"[^>]*aria-selected="false"[^>]*>Contentor</,
    );
    expect(markup).toMatch(
      /aria-selected="false"[^>]*>(?:<svg[^>]*>[\s\S]*?<\/svg>)?New</,
    );
    // only the tab she is on has asked for anything yet
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(1);
  });

  it("lets her open New while photos are left", () => {
    const markup = render(createElement(PhotoSources, photoSources));
    expect(markup).not.toMatch(
      /role="tab"[^>]*disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?New/,
    );
  });

  it("disables New when no new photos are left this month, and says why", () => {
    const markup = render(
      createElement(PhotoSources, { ...photoSources, generationsLeft: 0 }),
    );
    const trigger =
      markup.match(
        /<button[^>]*role="tab"[^>]*>(?:(?!<\/button>)[\s\S])*New<\/button>/,
      )?.[0] ?? "";
    expect(trigger).toContain('disabled=""');
    expect(trigger).toContain("You&#x27;ve used this month&#x27;s new photos.");
  });
});

describe("SimpleControls: suggested words", () => {
  it("puts a Suggest under each of the three words when the Designer can suggest them", () => {
    const suggest = vi.fn(async () => ["One"]);
    const markup = controls({ suggest });
    expect(markup.match(/>Suggest<\/button>/g)).toHaveLength(3);
    expect(controls()).not.toContain(">Suggest</button>");
    // nothing is asked until she taps one
    expect(suggest).not.toHaveBeenCalled();
  });
});
