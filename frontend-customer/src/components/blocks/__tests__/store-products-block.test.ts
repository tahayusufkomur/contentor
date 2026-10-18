import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Link needs a router context; a plain anchor is enough here.
vi.mock("next/link", async () => {
  const { createElement: h } =
    await vi.importActual<typeof import("react")>("react");
  return {
    default: ({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children?: ReactNode;
    }) => h("a", { href, className }, children),
  };
});

import { StoreProductsBlock } from "@/components/blocks/store-products-block";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { StoreItem } from "@/types/billing";
import type { CoverDesign } from "@/types/design";

const PHOTO = "11111111-1111-4111-8111-111111111111";
const DESIGN_URL = "https://cdn.test/design.jpg";
const PLAIN_URL = "https://cdn.test/plain.jpg";

const design = (): CoverDesign => ({
  id: "d1",
  recipe: defaultRecipe({ photoId: PHOTO }),
  photos: { [PHOTO]: DESIGN_URL },
  logo_url: null,
  look: "atelier",
});

const item = (over: Partial<StoreItem>): StoreItem => ({
  id: 1,
  title: "Morning flow",
  description: "",
  type: "course",
  price: "49",
  currency: "USD",
  thumbnail_url: "",
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
  },
  ...over,
});

// A designed course (its legacy link is the same photo, so any bare <img> outside the cover would
// show it) and a plain one.
const ITEMS = [
  item({ id: 1, cover_design: design(), thumbnail_url: DESIGN_URL }),
  item({ id: 2, title: "Plain course", thumbnail_url: PLAIN_URL }),
];

const render = (layout: string) =>
  renderToStaticMarkup(
    createElement(StoreProductsBlock, {
      data: { id: "blk_store0001", type: "store_products", layout },
      dynamicData: ITEMS,
    }),
  );
const count = (markup: string, needle: string) =>
  markup.split(needle).length - 1;

describe.each(["grid", "list"])("the store products block, %s", (layout) => {
  it("draws a kept cover design in place of the photo", () => {
    const out = render(layout);
    expect(count(out, 'data-cover=""')).toBe(1);
    // The photo shows inside the cover, never as a bare thumbnail (alt = the title) beside it.
    expect(out.indexOf(DESIGN_URL)).toBeGreaterThan(out.indexOf("data-cover"));
    expect(out).not.toContain('alt="Morning flow"');
  });

  it("keeps the plain photo for an item with no design", () => {
    expect(render(layout)).toContain(`<img src="${PLAIN_URL}"`);
  });
});
