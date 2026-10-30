import {
  createElement,
  type ComponentProps,
  type FC,
  type ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmailEditorProvider } from "@shared/email/editor/store";
import { BlockSettings } from "@shared/email/editor/panels/block-settings";
import {
  EmailEditor,
  blankDesign,
  createBlock,
  type BlockType,
  type BrandKit,
  type CatalogItem,
  type EmailDesign,
} from "@shared/email/editor";
import enSite from "../../../../packages/shared/src/i18n/messages/en/site.json";
import enStudio from "../../../../packages/shared/src/i18n/messages/en/studio.json";
import deSite from "../../../../packages/shared/src/i18n/messages/de/site.json";
import deStudio from "../../../../packages/shared/src/i18n/messages/de/studio.json";
import plSite from "../../../../packages/shared/src/i18n/messages/pl/site.json";
import plStudio from "../../../../packages/shared/src/i18n/messages/pl/studio.json";
import { englishText } from "./email-fixtures";

const Provider = EmailEditorProvider as FC<
  Omit<ComponentProps<typeof EmailEditorProvider>, "children">
>;
const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: Record<string, unknown>;
  onError?: (error: { code: string; message: string }) => void;
  children?: ReactNode;
}>;

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
  const blocks = ALL.map((type) => createBlock(type, englishText));
  for (const b of blocks) {
    if (b.type === "item") b.data.ref = ITEM.ref;
    if (b.type === "columns")
      b.data.columns[0].blocks = [
        createBlock("text", englishText),
        createBlock("button", englishText),
      ];
  }
  return { ...design, body: { blocks } };
}

function render(
  design: EmailDesign,
  features?: { items: boolean; brand: boolean },
  messages: Record<string, unknown> = { site: enSite, studio: enStudio },
  locale = "en",
) {
  return renderToStaticMarkup(
    createElement(
      Intl,
      { locale, messages },
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
    ),
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
    const item = createBlock("item", englishText);
    if (item.type === "item") item.data.ref = "course:999";
    const html = render({ ...design, body: { blocks: [item] } });
    expect(html).toContain("no longer available");
  });

  it("reads in the creator's language, while the email says what the site's language says", () => {
    // A German creator on an English site: the editor is German, the footer
    // the students get and the text a new block starts with are English.
    const html = render(
      everyBlock(),
      undefined,
      {
        site: enSite,
        studio: deStudio,
      },
      "de",
    );
    expect(html).toContain(deStudio.emailEditor.canvas.region.body);
    expect(html).toContain(deStudio.emailEditor.block.item);
    expect(html).toContain(enSite.email.unsubscribe);
    expect(html).not.toContain(deSite.email.unsubscribe);
    expect(html).not.toContain(">Body<");
    expect(html).not.toContain("Featured item");
  });

  it("writes the footer in the site's language whatever the creator reads", () => {
    // An English creator on a German site.
    const html = render(everyBlock(), undefined, {
      site: deSite,
      studio: enStudio,
    });
    expect(html).toContain(deSite.email.unsubscribe);
    expect(html).toContain("Featured item");
  });

  it("has every message the settings of every block type need, in each language", () => {
    const sets = {
      en: { site: enSite, studio: enStudio },
      de: { site: deSite, studio: deStudio },
      pl: { site: plSite, studio: plStudio },
    };
    const design = everyBlock();
    const missing: string[] = [];
    for (const [locale, messages] of Object.entries(sets)) {
      for (const block of [
        ...design.header.blocks,
        ...design.body.blocks,
        ...design.footer.blocks,
      ]) {
        renderToStaticMarkup(
          createElement(
            Intl,
            {
              locale,
              messages,
              onError: (e) => missing.push(`${locale} ${e.message}`),
            },
            createElement(
              Provider,
              {
                value: design,
                onChange: () => {},
                kit: KIT,
                items: [ITEM],
                features: { items: true, brand: true },
                pickImage: async () => null,
                pickLink: async () => null,
                pickItem: async () => ITEM,
                renderPreview: async () => "",
              },
              createElement(BlockSettings, { block }),
            ),
          ),
        );
      }
    }
    expect(missing).toEqual([]);
  });
});
