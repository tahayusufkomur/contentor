import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EmailEditor,
  blankDesign,
  createBlock,
  type BlockType,
  type BrandKit,
  type CatalogItem,
  type EmailDesign,
} from "@shared/email/editor";

const KIT: BrandKit = {
  name: "Studio Sol",
  site: "https://sol.example.com",
  host: "sol.example.com",
  logo: "",
  mark: "https://sol.example.com/pwa-icon?size=192",
  colors: {
    primary: "#aa3300",
    primaryForeground: "#ffffff",
    foreground: "#111111",
    muted: "#666666",
    surface: "#f5f1ea",
    background: "#ffffff",
    border: "#e5e5e5",
  },
  fonts: {
    heading: "'Fraunces', Georgia, serif",
    body: "Helvetica, Arial, sans-serif",
  },
  radius: 8,
  socials: [{ network: "instagram", url: "https://instagram.com/sol" }],
  address: "1 Sun Street, Lisbon",
};

const ITEM: CatalogItem = {
  ref: "course:1",
  kind: "course",
  title: "Morning Flow",
  summary: "Thirty minutes to wake the body.",
  image: "https://sol.example.com/i/flow.jpg",
  url: "https://sol.example.com/courses/morning-flow",
  meta: "€49 once",
};

const ALL: BlockType[] = [
  "text",
  "heading",
  "button",
  "image",
  "divider",
  "spacer",
  "columns",
  "social",
  "hero",
  "card",
  "list",
  "profile",
  "html",
  "item",
];

function everyBlock(): EmailDesign {
  const design = blankDesign();
  const blocks = ALL.map((type) => createBlock(type));
  for (const b of blocks) {
    if (b.type === "item") b.data.ref = ITEM.ref;
    if (b.type === "columns")
      b.data.columns[0].blocks = [createBlock("text"), createBlock("button")];
  }
  return { ...design, body: { blocks } };
}

function render(
  design: EmailDesign,
  features?: { items: boolean; brand: boolean },
) {
  return renderToStaticMarkup(
    createElement(EmailEditor, {
      value: design,
      onChange: () => {},
      kit: KIT,
      items: [ITEM],
      features,
      pickImage: async () => null,
      pickLink: async () => null,
      pickItem: async () => ITEM,
      renderPreview: async () => "<p>preview</p>",
    }),
  );
}

describe("email editor render", () => {
  it("draws every block type, the regions, the palette and the email settings", () => {
    const html = render(everyBlock());
    for (const label of ["Header", "Body", "Footer"])
      expect(html).toContain(label);
    expect(html).toContain("Morning Flow"); // the featured item, from the catalog
    expect(html).toContain("€49 once");
    expect(html).toContain("1 Sun Street, Lisbon"); // the brand footer's address
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("Custom HTML"); // an imported html block, read-only
    expect(html).toContain("Featured item"); // palette
    expect(html).toContain("Email settings"); // nothing selected
    expect(html).toContain("#f5f1ea"); // the page backdrop: brand:surface, resolved
  });

  it("hides the item and brand palette groups when the app turns them off", () => {
    const html = render(blankDesign(), { items: false, brand: false });
    expect(html).not.toContain("Your content");
    expect(html).not.toContain(">Brand<");
  });

  it("shows a placeholder for an item that is gone", () => {
    const design = blankDesign();
    const item = createBlock("item");
    if (item.type === "item") item.data.ref = "course:999";
    const html = render({ ...design, body: { blocks: [item] } });
    expect(html).toContain("no longer available");
  });
});
