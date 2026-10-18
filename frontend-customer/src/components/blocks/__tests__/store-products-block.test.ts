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
import { TenantContext } from "@/hooks/use-tenant";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { StoreItem } from "@/types/billing";
import type { CoverDesign } from "@/types/design";
import type { TenantConfig } from "@/types/tenant";

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

/** A design whose badge is of this kind (its text is read off the item's dates). */
const badged = (kind: "new" | "date"): CoverDesign => {
  const d = design();
  d.recipe.badge = { kind, text: "", fill: "accent" };
  return d;
};

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString();

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

/** The block as a visitor gets it; `timezone` is the tenant's, when the site has one. */
const render = (
  layout: string,
  items: StoreItem[] = ITEMS,
  timezone?: string,
) => {
  const block = createElement(StoreProductsBlock, {
    data: { id: "blk_store0001", type: "store_products", layout },
    dynamicData: items,
  });
  return renderToStaticMarkup(
    timezone
      ? createElement(
          TenantContext.Provider,
          { value: { timezone } as TenantConfig },
          block,
        )
      : block,
  );
};
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

describe.each(["grid", "list"])(
  "the cover's badge in the store products block, %s",
  (layout) => {
    it("shows New on the card of a course created today", () => {
      const course = item({
        cover_design: badged("new"),
        created_at: daysAgo(0),
      });
      const out = render(layout, [course]);
      expect(out).toContain('data-badge=""');
      expect(out).toContain(">New<");
    });

    it("leaves New off a course made months ago", () => {
      const course = item({
        cover_design: badged("new"),
        created_at: daysAgo(90),
      });
      expect(render(layout, [course])).not.toContain("data-badge");
    });

    it("reads an event's date in the tenant's time zone", () => {
      // 23:30 UTC on the 15th is already the 16th in Tokyo; without a tenant the zone is UTC.
      const event = item({
        type: "live_class",
        cover_design: badged("date"),
        scheduled_at: "2099-01-15T23:30:00Z",
      });
      expect(render(layout, [event])).toContain(">Jan 15<");
      expect(render(layout, [event], "Asia/Tokyo")).toContain(">Jan 16<");
    });
  },
);
