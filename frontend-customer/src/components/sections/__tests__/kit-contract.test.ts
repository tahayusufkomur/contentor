import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// NavLink needs the Next app router; a plain anchor is enough here.
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

import { SITE_STYLES } from "@shared/sections/styles";
import type { Block } from "@/types/tenant";
import { STYLE_KITS } from "../all-styles";
import { DEFAULT_KIT, type KitTone } from "../kit-contract";

const TONES: KitTone[] = ["base", "surface", "inverse"];
const BLOCK: Block = {
  id: "blk_kit00001",
  type: "cx",
  kicker: "Kicker words",
  heading: "Heading words",
  intro: "Intro words",
};
const ALL = () => [...Object.values(STYLE_KITS), DEFAULT_KIT];

describe("StyleKit contract", () => {
  it("every site style ships a kit under its own id", () => {
    expect(Object.keys(STYLE_KITS).sort()).toEqual(
      Object.keys(SITE_STYLES).sort(),
    );
    for (const [id, kit] of Object.entries(STYLE_KITS)) expect(kit.id).toBe(id);
  });

  it("each kit's Section renders every tone", () => {
    for (const kit of ALL()) {
      for (const tone of TONES) {
        const html = renderToStaticMarkup(
          // eslint-disable-next-line react/no-children-prop -- Section requires children as a prop
          createElement(kit.Section, {
            tone,
            label: "x",
            children: "band body",
          }),
        );
        expect(html, `${kit.id}/${tone}`).toContain("band body");
      }
    }
  });

  it("each kit's Opener renders the heading", () => {
    for (const kit of ALL()) {
      expect(
        renderToStaticMarkup(createElement(kit.Opener, { block: BLOCK })),
        kit.id,
      ).toContain("Heading words");
    }
  });

  it("every class slot is filled", () => {
    for (const kit of ALL()) {
      for (const slot of [
        kit.h2,
        kit.h3,
        kit.display,
        kit.label,
        kit.button.primary,
        kit.button.ghost,
        kit.button.onInverse,
        kit.card,
      ]) {
        expect(slot, kit.id).toBeTruthy();
      }
    }
  });
});
