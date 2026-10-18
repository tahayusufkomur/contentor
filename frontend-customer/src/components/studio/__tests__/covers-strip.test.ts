import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { CoversStrip } from "@/components/studio/covers-strip";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { CoverDesign, DesignTarget } from "@/types/design";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;

const cover: CoverDesign = {
  id: "d1",
  recipe: defaultRecipe(),
  photos: {},
  logo_url: null,
  look: "atelier",
};
const target = (
  key: string,
  over: Partial<DesignTarget> = {},
): DesignTarget => ({
  target_kind: "course",
  target_key: key,
  title: `Course ${key}`,
  sessions: null,
  next_at: null,
  status: "published",
  created_at: null,
  photo_url: null,
  cover,
  draft_id: null,
  ...over,
});

const strip = (props: Partial<Parameters<typeof CoversStrip>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", messages },
      createElement(CoversStrip, {
        targets: [target("1"), target("2")],
        cardAspect: "4/5",
        timeZone: "UTC",
        ...props,
      }),
    ),
  );

/** The shape of every tile's box (CoverBox writes it as `aspect-ratio`). */
const shapes = (markup: string) =>
  [...markup.matchAll(/aspect-ratio:([\d.]+)/g)].map((m) => +m[1]);

describe("CoversStrip", () => {
  it("is a row of Wide tiles when it is given no size, whatever her look's Card is", () => {
    for (const cardAspect of ["3/4", "4/5", "1/1"] as const) {
      expect(shapes(strip({ cardAspect }))).toEqual([16 / 9, 16 / 9]);
    }
  });

  it("takes the shape of the size it is given, as the phone's page shows it", () => {
    expect(shapes(strip({ size: "card" }))).toEqual([0.8, 0.8]);
    expect(shapes(strip({ size: "wide" }))).toEqual([16 / 9, 16 / 9]);
    expect(shapes(strip({ size: "banner" }))).toEqual([3, 3]);
  });

  it("makes each tile 12rem (192 px) wide, over the 180 px under which a cover shows its photo alone", () => {
    const tiles = strip().match(/<li class="[^"]*">/g) ?? [];
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) expect(tile).toContain("w-48");
  });

  it("gives every tile's name its full text as a title, one line long", () => {
    const markup = strip({
      targets: [
        target("1", { title: "Breathwork and Journaling for Busy Weeks" }),
      ],
    });
    expect(markup).toMatch(
      /<p class="truncate[^"]*" title="Breathwork and Journaling for Busy Weeks">/,
    );
  });

  it("leaves out a target with no cover, and draws nothing when none has one", () => {
    expect(
      strip({ targets: [target("1"), target("2", { cover: null })] }).match(
        /<li /g,
      ),
    ).toHaveLength(1);
    expect(strip({ targets: [target("1", { cover: null })] })).toBe("");
  });

  it("holds its height in a column that must not shrink it", () => {
    expect(strip()).toMatch(/<section[^>]*class="[^"]*\bshrink-0\b/);
  });
});
