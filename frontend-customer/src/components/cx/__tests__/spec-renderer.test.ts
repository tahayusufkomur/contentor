import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

import type { CxSpec } from "@shared/cx/types";
import { STYLE_KITS } from "@/components/sections/all-styles";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import { CxBlock } from "../cx-block";
import { ITINERARY_SPEC, itineraryBlock } from "./fixtures";

const EDITABLE: EditableContext = { onTextChange: () => {} };
const html = (block: Block, styleId: string, editable?: EditableContext) =>
  renderToStaticMarkup(
    createElement(CxBlock, { data: block, styleId, editable }),
  );

describe("SpecRenderer", () => {
  it("renders the section in every site style", () => {
    for (const id of Object.keys(STYLE_KITS)) {
      const out = html(itineraryBlock(), id);
      expect(out, id).toContain("How the week unfolds");
      expect(out, id).toContain("Find your rhythm");
      expect(out, id).toContain("https://img.test/day1.jpg");
    }
  });

  it("falls back to the neutral kit for an unknown or empty style", () => {
    for (const id of ["", "no-such-style"]) {
      expect(html(itineraryBlock(), id), id).toContain("Arrive and settle");
    }
  });

  it("renders nothing for a block without a spec", () => {
    expect(html({ id: "blk_x", type: "cx" }, "maison")).toBe("");
  });

  it("an empty item list leaves no editor hint on the public site", () => {
    const out = html(itineraryBlock({ days: [] }), "maison");
    expect(out).toContain("How the week unfolds");
    expect(out).not.toContain("Add items");
  });

  it("an empty item list shows a hint while editing", () => {
    expect(html(itineraryBlock({ days: [] }), "maison", EDITABLE)).toContain(
      "Add items in the editor panel",
    );
  });

  it("skips primitives this build does not know", () => {
    const spec = structuredClone(ITINERARY_SPEC);
    spec.tree.children!.push({ t: "Hologram" }, { t: "constructor" });
    expect(
      html(itineraryBlock({ cx: { ref: null, spec } }), "maison"),
    ).toContain("Find your rhythm");
  });

  it("embeds an existing family layout with its fields remapped", () => {
    const spec: CxSpec = {
      csl: 1,
      name: "Perks",
      summary: "",
      dynamic: null,
      fields: {
        heading: { type: "text", label: "Heading", max: 80 },
        perks: {
          type: "items",
          label: "Perks",
          max: 6,
          min: 0,
          itemLabel: "Perk",
          fields: {
            title: { type: "text", label: "Title", max: 40 },
            text: { type: "text", label: "Text", max: 160 },
          },
        },
      },
      tree: {
        t: "Layout",
        family: "benefits",
        variant: "auto",
        map: { heading: "heading", items: "perks" },
      },
    };
    const out = html(
      {
        id: "blk_perks001",
        type: "cx",
        cx: { ref: null, spec },
        heading: "Why train here",
        perks: [{ title: "Small groups", text: "Six people at most." }],
      },
      "maison",
    );
    expect(out).toContain("Why train here");
    expect(out).toContain("Small groups");
  });
});
