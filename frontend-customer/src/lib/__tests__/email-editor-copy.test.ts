import { describe, expect, it } from "vitest";

import {
  createBlock,
  createQuote,
  type DefaultText,
} from "@shared/email/editor/factory";
import type { HeadingBlock, TextBlock } from "@shared/email/editor/types";
import deSite from "../../../../packages/shared/src/i18n/messages/de/site.json";
import plSite from "../../../../packages/shared/src/i18n/messages/pl/site.json";
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
    expect(words).not.toMatch(/[a-ząćęłńóśźż]*(łeś|łaś)\b/);
    expect(words).not.toMatch(/\bdumny\b|\bjesteś zalogowany\b/);
  });
});
