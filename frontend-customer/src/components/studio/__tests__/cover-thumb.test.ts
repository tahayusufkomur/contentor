import { createElement } from "react";
import { renderToStaticMarkup as renderBare } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { CoverThumb } from "@/components/studio/cover-thumb";
import { defaultRecipe } from "@/lib/covers/recipe";
import { targetItem } from "@/lib/covers/targets";
import type { BadgeKind, CoverDesign, DesignTarget } from "@/types/design";

// useLocale needs a provider; the components under test read no messages.
// createElement wants children among this provider's props; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  children?: React.ReactNode;
}>;
const renderToStaticMarkup = (el: Parameters<typeof renderBare>[0]) =>
  renderBare(createElement(Intl, { locale: "en" }, el));

const DAY = 86_400_000;
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString();

/** A kept design whose cover carries a badge of `kind`. */
function badged(kind: BadgeKind): CoverDesign {
  const recipe = defaultRecipe();
  recipe.badge = { kind, text: "", fill: "accent" };
  return { id: "d1", recipe, photos: {}, logo_url: null, look: "atelier" };
}

const target = (over: Partial<DesignTarget> = {}): DesignTarget => ({
  target_kind: "course",
  target_key: "7",
  title: "Yoga for Beginners",
  sessions: null,
  next_at: null,
  status: "published",
  created_at: null,
  photo_url: null,
  cover: null,
  draft_id: null,
  ...over,
});

/** The text of every badge the tile draws (one for each of the cover's three sizes). */
function badges(row: DesignTarget, kind: BadgeKind, timeZone = "UTC") {
  const markup = renderToStaticMarkup(
    createElement(CoverThumb, {
      design: badged(kind),
      item: targetItem(row, timeZone),
    }),
  );
  return [
    ...markup.matchAll(/data-badge="" [^>]*><span[^>]*>([^<]*)<\/span>/g),
  ].map((m) => m[1]);
}

describe("a list tile's badges follow its item, as on the site", () => {
  it("a course made today wears New", () => {
    expect(badges(target({ created_at: daysFromNow(0) }), "new")).toEqual([
      "New",
      "New",
      "New",
    ]);
  });

  it("a course made 60 days ago does not", () => {
    expect(badges(target({ created_at: daysFromNow(-60) }), "new")).toEqual([]);
  });

  it("a course with no creation date does not", () => {
    expect(badges(target(), "new")).toEqual([]);
  });

  it("a series wears the date of its next session", () => {
    const next = daysFromNow(3);
    const day = new Date(next).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const series = target({ target_kind: "live", next_at: next, sessions: 4 });
    expect(badges(series, "date")).toEqual([day, day, day]);
  });

  it("a series with no session to come has no date to wear", () => {
    expect(
      badges(target({ target_kind: "live", sessions: 4 }), "date"),
    ).toEqual([]);
  });
});
