import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } =
    await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({
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

import {
  ITINERARY_SPEC,
  itineraryBlock,
} from "@/components/cx/__tests__/fixtures";
import { cxFields } from "@/lib/blocks/cx-defs";
import { dynamicKeyOf, getBlockDef } from "@/lib/blocks/registry";
import { pageWrapperClass } from "@/lib/blocks/section-defs";

describe("cx block wiring", () => {
  it("is a registered block type that the palette never offers", () => {
    expect(getBlockDef("cx")?.label).toBe("Custom section");
    expect(getBlockDef("cx")?.group).toBe("custom");
  });

  it("asks for the dataset its spec names", () => {
    const spec = { ...ITINERARY_SPEC, dynamic: "plans" as const };
    expect(dynamicKeyOf({ id: "b", type: "cx", cx: { ref: null, spec } })).toBe(
      "plans",
    );
    expect(dynamicKeyOf(itineraryBlock())).toBeUndefined();
    expect(dynamicKeyOf({ id: "b", type: "section.pricing" })).toBe("plans");
  });

  it("builds its form from the block's own spec", () => {
    const fields = cxFields(itineraryBlock());
    expect(fields.map((f) => f.key)).toEqual([
      "kicker",
      "heading",
      "intro",
      "days",
    ]);
    expect(fields[3].type).toBe("repeater");
    expect(fields[3].itemFields?.map((f) => f.key)).toEqual([
      "when",
      "title",
      "text",
      "image",
    ]);
    expect(cxFields({ id: "b", type: "cx" })).toEqual([]);
  });

  it("makes a page full-bleed like styled sections", () => {
    expect(pageWrapperClass([{ type: "cx" }])).toBe("page-fullbleed");
  });
});
