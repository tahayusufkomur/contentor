import { createElement } from "react";
import type { FC, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NextIntlClientProvider,
  useFormatter,
  useTranslations,
} from "next-intl";
import { describe, expect, it } from "vitest";
import adminEn from "../../../messages/en/admin.json";
import studentEn from "../../../messages/en/student.json";
import adminPl from "../../../messages/pl/admin.json";
import siteEn from "../../../../packages/shared/src/i18n/messages/en/site.json";
import sitePl from "../../../../packages/shared/src/i18n/messages/pl/site.json";
import { SitePreview } from "@shared/i18n/site-preview";
import { AsCreator, AsSite, OwnerFrame, OwnerLocales } from "../creator-scope";

const Provider = NextIntlClientProvider as FC<{
  locale: string;
  timeZone?: string;
  messages: Record<string, unknown>;
  children?: ReactNode;
}>;
const Owner = OwnerLocales as FC<{
  creator: string;
  site: string;
  children?: ReactNode;
}>;
const Creator = AsCreator as FC<{ children?: ReactNode }>;
const Site = AsSite as FC<{ children?: ReactNode }>;

// One line of owner chrome: a creator plural (logo studio), a site plural, a date.
function Line({ count }: { count: number }) {
  const admin = useTranslations("admin.logo.chat");
  const site = useTranslations("site.course");
  const format = useFormatter();
  const day = format.dateTime(new Date(Date.UTC(2026, 0, 15)), {
    month: "long",
  });
  return createElement(
    "p",
    null,
    `${admin("turnsLeft", { count })} | ${site("lessons", { count })} | ${day}`,
  );
}

// The page as request.ts builds it for a site+owner surface: the SITE's locale,
// with the creator's `admin` messages loaded in the creator's language.
const page = (creator: string, site: string, el: ReactNode) =>
  createElement(
    Provider,
    {
      locale: site,
      timeZone: "UTC",
      messages: { admin: creator === "pl" ? adminPl : adminEn, site: siteEn },
    },
    createElement(Owner, { creator, site }, el),
  );
const line = (count: number) => createElement(Line, { count });

describe("owner chrome on a site+owner page", () => {
  it("a Polish creator on an English site gets Polish plurals and dates in her tools", () => {
    const two = renderToStaticMarkup(
      page("pl", "en", createElement(Creator, null, line(2))),
    );
    const five = renderToStaticMarkup(
      page("pl", "en", createElement(Creator, null, line(5))),
    );
    // few / many, the forms English rules cannot pick
    expect(two).toContain("Pozostały 2 próby projektowania AI");
    expect(five).toContain("Pozostało 5 prób projektowania AI");
    expect(two).toContain("styczeń");
    expect(two).toContain('lang="pl"');
  });

  it("the site's own messages on the same page keep English rules and dates", () => {
    const html = renderToStaticMarkup(
      page("pl", "en", createElement(Site, null, line(5))),
    );
    // Site scope = the page's own provider: English dates, English rules for site.*
    expect(html).toContain("5 lessons");
    expect(html).toContain("January");
    expect(html).not.toContain("lang=");
  });

  it("the site's content inside the creator's chrome goes back to the site's locale", () => {
    const html = renderToStaticMarkup(
      page(
        "pl",
        "en",
        createElement(Creator, null, createElement(Site, null, line(5))),
      ),
    );
    expect(html).toContain("January");
    expect(html).toContain('lang="en"');
  });

  it("the same language on both sides adds nothing", () => {
    const html = renderToStaticMarkup(
      page("en", "en", createElement(Creator, null, line(2))),
    );
    expect(html).not.toContain("lang=");
    expect(html).toContain("2 lessons");
    expect(html).toContain("January");
  });

  it("without the page's locales it leaves its children alone", () => {
    const html = renderToStaticMarkup(
      createElement(
        Provider,
        { locale: "en", messages: { admin: adminEn, site: siteEn } },
        createElement(Creator, null, line(2)),
      ),
    );
    expect(html).not.toContain("lang=");
  });
});

// The owner chrome that stays on the site's provider (it sits between blocks,
// one per block) has no count, date or number to format. If one gets added,
// wrap that component in AsCreator.
describe("owner chrome left on the page's own provider", () => {
  const FORMATTED =
    /\{[^}]*,\s*(plural|select|selectordinal|number|date|time)\b/;
  const toolbar = adminEn.owner.toolbar as Record<string, string>;
  const canvas = adminEn.owner.canvas as Record<string, string>;
  it.each([
    ["owner.toolbar", toolbar],
    ["owner.canvas", canvas],
    ["cx.emptyItems", { emptyItems: adminEn.cx.emptyItems }],
  ])("%s has only plain messages", (_name, messages) => {
    for (const text of Object.values(messages))
      expect(text).not.toMatch(FORMATTED);
  });
});

// OwnerFrame is the composition the public layout mounts: the owner's tools
// around the page. `Chrome` stands in for EditSidebar: it takes the page as its
// children, like the real one.
function SiteLine({ count }: { count: number }) {
  return createElement(
    "i",
    null,
    useTranslations("site.course")("lessons", { count }),
  );
}
function Copilot({ count }: { count: number }) {
  const t = useTranslations("admin.copilot");
  return createElement(
    "b",
    null,
    `${t("title")} | ${t("appliedAll", { count })}`,
  );
}
function Chrome({ children }: { children?: ReactNode }) {
  return createElement(
    "div",
    null,
    createElement(Copilot, { count: 2 }),
    createElement(
      "section",
      null,
      createElement(SitePreview, null, createElement(SiteLine, { count: 2 })),
    ),
    createElement("main", null, children),
  );
}
const Frame = OwnerFrame as FC<{
  creator: string;
  site: string;
  tools: React.ReactElement;
  children?: ReactNode;
}>;
const frame = (
  creator: string,
  site: string,
  messages: Record<string, unknown>,
) =>
  renderToStaticMarkup(
    createElement(
      Provider,
      { locale: site, timeZone: "UTC", messages },
      createElement(
        Frame,
        { creator, site, tools: createElement(Chrome) },
        createElement(SiteLine, { count: 2 }),
      ),
    ),
  );

describe("OwnerFrame, the page as the layout composes it", () => {
  // A Polish site and an English creator: `lessons` has few (2 lekcje) and other (2 lekcji).
  const html = () => frame("en", "pl", { admin: adminEn, site: sitePl });

  it("a preview of what visitors see inside the tools follows the site's rules", () => {
    expect(html()).toMatch(/<section><div[^>]*><i>2 lekcje<\/i>/);
  });
  it("the page inside the tools follows the site's rules", () => {
    expect(html()).toMatch(/<main><div[^>]*><i>2 lekcje<\/i>/);
  });
});

describe("the copilot speaks the creator's language", () => {
  // A Polish creator on an English site: `admin` in Polish, `site` in English.
  const html = () => frame("pl", "en", { admin: adminPl, site: siteEn });

  it("wording and the plural of appliedAll (few, many) are Polish", () => {
    const [few, many] = [2, 5].map((count) =>
      renderToStaticMarkup(
        createElement(
          Provider,
          { locale: "en", timeZone: "UTC", messages: { admin: adminPl } },
          createElement(
            Owner,
            { creator: "pl", site: "en" },
            createElement(Creator, null, createElement(Copilot, { count })),
          ),
        ),
      ),
    );
    expect(few).toContain("Twój asystent AI");
    expect(few).toMatch(/Zastosowano 2 zmiany/);
    expect(many).toMatch(/Zastosowano 5 zmian/);
    expect(html()).toContain("Twój asystent AI");
  });
  it("no copilot wording is left in the site-language namespace", () => {
    expect(Object.keys(studentEn)).not.toContain("copilot");
    expect(Object.keys(adminEn)).toContain("copilot");
  });
});
