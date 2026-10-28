import { createElement } from "react";
import { renderToStaticMarkup as renderBare } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import site from "@shared/i18n/messages/en/site.json";
import type { AccessInfo } from "@/types/billing";
import { PriceBadge } from "../price-badge";

// useLocale needs a provider; the components under test read the English site messages.
// createElement wants children among this provider's props; pass them as arguments.
const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;
const renderToStaticMarkup = (el: Parameters<typeof renderBare>[0]) =>
  renderBare(createElement(Intl, { locale: "en", messages: { site } }, el));

const paid = (price: string, currency: string | null): AccessInfo => ({
  has_access: false,
  pricing_type: "paid",
  price,
  currency,
  access_reason: null,
  unlock_methods: null,
  access_ends_at: null,
  opens_at: null,
});

const render = (accessInfo: AccessInfo) =>
  renderToStaticMarkup(createElement(PriceBadge, { accessInfo }));

describe("PriceBadge", () => {
  it("prints the price the way every other price on the site reads", () => {
    expect(render(paid("49.00", "EUR"))).toContain(">€49<");
    expect(render(paid("19.90", "USD"))).toContain(">$19.90<");
  });

  it("reads an unknown currency as USD, like kit's coursePriceLabel", () => {
    expect(render(paid("49.00", null))).toContain(">$49<");
  });
});
