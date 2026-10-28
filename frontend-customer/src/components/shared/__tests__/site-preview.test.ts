import { createElement } from "react";
import type { FC, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";
import tr from "@shared/i18n/messages/tr/site.json";
import * as sitePreview from "@shared/i18n/site-preview";

const Provider = NextIntlClientProvider as FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: ReactNode;
}>;

// Typed so children can be passed the createElement way.
const Boundary = sitePreview.SiteLocaleBoundary as FC<{
  locale: string;
  children?: ReactNode;
}>;
const SitePreview = sitePreview.SitePreview as FC<{ children?: ReactNode }>;

// A section kit in miniature: placeholder text from `site`, a date in the active locale.
function Block() {
  const t = useTranslations("site.placeholder");
  const locale = useLocale();
  const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(
    new Date(2026, 0, 15),
  );
  return createElement("span", null, `${t("heading")} | ${month}`);
}

// The studio as request.ts builds it: the creator's locale, `site` already in the site's language.
const studio = (el: ReactNode) =>
  createElement(Provider, { locale: "en", messages: { site: tr } }, el);

describe("SitePreview", () => {
  it("shows the site's language inside a studio in another one", () => {
    const html = renderToStaticMarkup(
      studio(
        createElement(
          Boundary,
          { locale: "tr" },
          createElement(SitePreview, null, createElement(Block)),
        ),
      ),
    );
    expect(html).toContain('lang="tr"');
    expect(html).toContain("Başlık | Ocak");
  });

  it("leaves its children alone without a boundary", () => {
    const html = renderToStaticMarkup(
      studio(createElement(SitePreview, null, createElement(Block))),
    );
    expect(html).not.toContain("lang=");
    expect(html).toContain("Başlık | January");
  });
});
