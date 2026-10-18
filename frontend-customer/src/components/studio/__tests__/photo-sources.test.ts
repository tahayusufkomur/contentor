import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  appendUnique,
  PhotoSources,
  prependUnique,
} from "@/components/studio/photo-sources";
import adminMessages from "../../../../messages/en/admin.json";

const messages = { admin: adminMessages };
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: typeof messages;
  children?: React.ReactNode;
}>;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(Intl, { locale: "en", messages }, node));

const props = {
  cardAspect: "4/5" as const,
  inUse: {},
  generationsLeft: 5,
  onPick: vi.fn(),
};

describe("PhotoSources tab", () => {
  it("shows the tab the caller sets: the rail's New photo opens it on New", () => {
    const markup = render(
      createElement(PhotoSources, { ...props, tab: "new" }),
    );
    expect(markup).toMatch(
      /role="tab"[^>]*aria-selected="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?New</,
    );
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Yours</);
    // only the tab it is on has been opened, and it is the New one
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(markup).toContain("Describe the photo");
    expect(markup).not.toContain("Search photos");
  });

  it("opens on Yours when the caller sets nothing", () => {
    const markup = render(createElement(PhotoSources, props));
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Yours</);
  });
});

describe("PhotoSources month count", () => {
  const onNew = (generationsLeft: number) =>
    render(
      createElement(PhotoSources, { ...props, generationsLeft, tab: "new" }),
    );

  it("shows the count the caller keeps, and holds the New tab once it is used up", () => {
    expect(onNew(2)).toContain("2 new photos left this month");
    expect(onNew(1)).toContain("1 new photo left this month");
    const used = onNew(0);
    expect(used).toContain("You&#x27;ve used this month&#x27;s new photos.");
    expect(used).toMatch(
      /role="tab"[^>]*disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?New</,
    );
  });
});

describe("no photo is listed twice", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("leaves out of the next page what the list already has", () => {
    // a photo she uploaded sits at the top, so the next page, counted from before, starts with one she has
    expect(appendUnique([a, b], [b, c])).toEqual([a, b, c]);
    expect(appendUnique([a], [])).toEqual([a]);
  });

  it("puts an upload first, and does not keep a second copy of it", () => {
    expect(prependUnique([a, b], c)).toEqual([c, a, b]);
    expect(prependUnique([a, b], b)).toEqual([b, a]);
  });
});
