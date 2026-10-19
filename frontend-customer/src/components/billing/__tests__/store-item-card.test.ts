import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoreItemCard } from "@/components/billing/store-item-card";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { StoreItem } from "@/types/billing";
import type { CoverDesign } from "@/types/design";

const PHOTO = "11111111-1111-4111-8111-111111111111";
const DESIGN_URL = "https://cdn.test/design.jpg";
const PLAIN_URL = "https://cdn.test/plain.jpg";
const DAY = 24 * 60 * 60 * 1000;

/** A kept design whose badge says New when the course is recent. */
const design = (): CoverDesign => {
  const recipe = defaultRecipe({ photoId: PHOTO });
  recipe.badge = { kind: "new", text: "", fill: "accent" };
  return {
    id: "d1",
    recipe,
    photos: { [PHOTO]: DESIGN_URL },
    logo_url: null,
    look: "atelier",
  };
};

const course = (over: Partial<StoreItem> = {}): StoreItem => ({
  id: 1,
  title: "Morning flow",
  description: "",
  type: "course",
  price: "49",
  currency: "USD",
  thumbnail_url: PLAIN_URL,
  is_active: true,
  item_count: 0,
  original_price: null,
  access_info: {
    has_access: false,
    pricing_type: "paid",
    price: "49",
    currency: "USD",
    access_reason: null,
    unlock_methods: ["purchase"],
    access_ends_at: null,
    opens_at: null,
  },
  ...over,
});

const render = (item: StoreItem) =>
  renderToStaticMarkup(
    createElement(StoreItemCard, {
      item,
      adding: false,
      onAddToCart: () => {},
    }),
  );
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString();

describe("the store card", () => {
  it("shows the New badge of a course created today", () => {
    const out = render(
      course({ cover_design: design(), created_at: daysAgo(0) }),
    );
    expect(out).toContain('data-cover=""');
    expect(out).toContain('data-badge=""');
    expect(out).toContain(">New<");
  });

  it("leaves New off a course made months ago", () => {
    const out = render(
      course({ cover_design: design(), created_at: daysAgo(90) }),
    );
    expect(out).toContain('data-cover=""');
    expect(out).not.toContain("data-badge");
  });

  it("draws the course's photo when it has no design", () => {
    const out = render(course({ created_at: daysAgo(0) }));
    expect(out).not.toContain("data-cover");
    expect(out).toContain(`<img src="${PLAIN_URL}"`);
  });
});
