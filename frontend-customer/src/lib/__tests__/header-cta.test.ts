import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import site from "@shared/i18n/messages/en/site.json";
import { headerCtaLabel, resolveHeaderCta } from "../header-cta";

const t = createTranslator({
  locale: "en",
  messages: { site },
  namespace: "site",
});

describe("headerCtaLabel", () => {
  it("relabels only the untouched legacy default", () => {
    expect(headerCtaLabel({ text: "Get Started", href: "/courses" }, t)).toBe(
      "Start a course",
    );
    expect(headerCtaLabel({ text: "Book your spot", href: "/events" }, t)).toBe(
      "Book your spot",
    );
  });
  it("keeps the legacy default where no offer names the destination", () => {
    expect(headerCtaLabel({ text: "Get Started", href: "/about" }, t)).toBe(
      "Get Started",
    );
  });
});

describe("resolveHeaderCta", () => {
  const menu = { courses: true, events: true };
  it("is the coach's button, with the label of her offer", () => {
    expect(
      resolveHeaderCta({ text: "Get Started", href: "/events" }, true, t, menu),
    ).toEqual({ text: "Book a session", href: "/events" });
  });
  it("is nothing when she turned the button off", () => {
    expect(resolveHeaderCta(null, true, t, menu)).toBeNull();
  });
  it("falls back to Contact when nothing is behind the destination", () => {
    const empty = { courses: false, events: false };
    expect(
      resolveHeaderCta(
        { text: "Get Started", href: "/courses" },
        true,
        t,
        empty,
      ),
    ).toEqual({ text: "Get in touch", href: "/contact" });
    expect(
      resolveHeaderCta({ text: "Join", href: "/plans" }, false, t, menu),
    ).toEqual({ text: "Get in touch", href: "/contact" });
  });
});
