import { createElement } from "react";
import { renderToStaticMarkup as renderBare } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import common from "../../../../messages/en/common.json";
import { PlanCheckoutAside } from "@shared/checkout/embedded-checkout";

const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;
const render = (plan: Parameters<typeof PlanCheckoutAside>[0]["plan"]) =>
  renderBare(
    createElement(
      Intl,
      { locale: "en", messages: { common } },
      createElement(PlanCheckoutAside, { title: "Pro", plan }),
    ),
  );

describe("PlanCheckoutAside", () => {
  it("says what is charged today when there is no trial", () => {
    const html = render({
      name: "Pro",
      currency: "usd",
      amount_cents: 2900,
      trial_days: 0,
    });
    expect(html).toContain("starts at $29 a month.");
    expect(html).toContain("Every month after");
    expect(html).toContain(
      "It renews on its own. Cancel any time from Billing.",
    );
  });

  it("walks through a free trial", () => {
    const html = render({
      name: "Pro",
      currency: "usd",
      amount_cents: 2900,
      trial_days: 14,
    });
    expect(html).toContain("Nothing to pay. Your 14 free days start now.");
    expect(html).toContain(
      "Try everything. Cancel from Billing and you pay nothing.",
    );
    expect(html).toContain("begins at $29 a month.");
  });
});
