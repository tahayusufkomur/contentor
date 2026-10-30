import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  createBlock,
  createQuote,
  type DefaultText,
} from "@shared/email/editor/factory";
import type { HeadingBlock, TextBlock } from "@shared/email/editor/types";
import deSite from "../../../../packages/shared/src/i18n/messages/de/site.json";
import trSite from "../../../../packages/shared/src/i18n/messages/tr/site.json";
import plSite from "../../../../packages/shared/src/i18n/messages/pl/site.json";
import enStudio from "../../../../packages/shared/src/i18n/messages/en/studio.json";
import deStudio from "../../../../packages/shared/src/i18n/messages/de/studio.json";
import plStudio from "../../../../packages/shared/src/i18n/messages/pl/studio.json";

const german: DefaultText = (key) => deSite.email.defaults[key];

describe("the words a new email block starts with", () => {
  it("come in the site's language, once, and then belong to the creator", () => {
    const heading = createBlock("heading", german) as HeadingBlock;
    expect(heading.data.text).toBe(deSite.email.defaults.headline);
    const text = createBlock("text", german) as TextBlock;
    expect(text.data.html).toBe(`<p>${deSite.email.defaults.message}</p>`);
    const quote = createQuote(german) as TextBlock;
    expect(quote.data.html).toContain(deSite.email.defaults.quote);
    expect(quote.data.html).toContain(deSite.email.defaults.quoteBy);
  });

  it("never turn a translation into markup", () => {
    const text = createBlock("text", () => "<b>Fish & chips</b>") as TextBlock;
    expect(text.data.html).toBe("<p>&lt;b&gt;Fish &amp; chips&lt;/b&gt;</p>");
  });
});

describe("Polish in the email editor", () => {
  it("never assumes the creator's gender", () => {
    const words = JSON.stringify([
      plStudio.emailEditor,
      plSite.email,
    ]).toLowerCase();
    expect(words).not.toMatch(/(łeś|łaś)(?![\p{L}])/u);
    expect(words).not.toMatch(/\bdumny\b|\bjesteś zalogowany\b/);
  });
});

// The canvas footer shows what the sent mail says (email_campaigns/render.py
// `_("Unsubscribe")`): the two are drafted separately, so they are compared.
describe("the canvas footer's unsubscribe word", () => {
  const sites = { tr: trSite, de: deSite, pl: plSite };
  for (const [locale, site] of Object.entries(sites)) {
    // Skipped where backend/ is not in the test environment (a Next-only container).
    const po = join(
      __dirname,
      `../../../../backend/locale/${locale}/LC_MESSAGES/django.po`,
    );
    it.skipIf(!existsSync(po))(`matches the sent mail in ${locale}`, () => {
      const msgstr = /msgid "Unsubscribe"\nmsgstr "([^"]*)"/.exec(
        readFileSync(po, "utf8"),
      )?.[1];
      expect(msgstr).toBeTruthy();
      expect(site.email.unsubscribe).toBe(msgstr);
    });
  }
});

describe("the block's drag handle", () => {
  it("names the block in every language", () => {
    const messages = { en: enStudio, de: deStudio, pl: plStudio };
    for (const [locale, studio] of Object.entries(messages)) {
      const t = createTranslator({
        locale,
        messages: { studio },
        namespace: "studio.emailEditor.canvas.toolbar",
      });
      expect(t("moveBlock", { label: "XYZ" })).toContain("XYZ");
    }
  });
});
