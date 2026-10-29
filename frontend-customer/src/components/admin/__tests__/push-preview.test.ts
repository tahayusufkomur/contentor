import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SiteLocaleBoundary } from "@shared/i18n/site-preview";
import adminPl from "../../../../messages/pl/admin.json";
import sitePl from "../../../../../packages/shared/src/i18n/messages/pl/site.json";
import siteDe from "../../../../../packages/shared/src/i18n/messages/de/site.json";
import { PushPreview } from "../push-preview";

const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  timeZone: string;
  messages: unknown;
  children?: React.ReactNode;
}>;

// A Polish creator on a German site: the studio caption is Polish, the phone is German.
const html = renderToStaticMarkup(
  createElement(
    Intl,
    {
      locale: "pl",
      timeZone: "UTC",
      messages: { admin: adminPl, site: siteDe },
    },
    createElement(SiteLocaleBoundary, {
      locale: "de",
      children: createElement(PushPreview, { title: "", body: "" }),
    }),
  ),
);

describe("the announcement's phone preview", () => {
  it("keeps the studio caption in the creator's language", () => {
    expect(html).toContain(adminPl.messages.compose.preview.caption);
  });

  it("shows the phone's own text in the site's language", () => {
    expect(html).toContain(siteDe.pushPreview.date);
    expect(html).toContain(siteDe.pushPreview.now);
    expect(html).toContain(siteDe.pushPreview.body);
    expect(html).toContain('lang="de"');
    expect(html).not.toContain(sitePl.pushPreview.date);
  });
});
