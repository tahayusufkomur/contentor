import { describe, expect, it } from "vitest";
import { headerCtaLabel, resolveHeaderCta } from "../header-cta";

describe("headerCtaLabel", () => {
  it("relabels only the untouched legacy default", () => {
    expect(headerCtaLabel({ text: "Get Started", href: "/courses" })).toBe(
      "Start a course",
    );
    expect(headerCtaLabel({ text: "Book your spot", href: "/events" })).toBe(
      "Book your spot",
    );
  });
  it("keeps the legacy default where no offer names the destination", () => {
    expect(headerCtaLabel({ text: "Get Started", href: "/about" })).toBe(
      "Get Started",
    );
  });
});

describe("resolveHeaderCta", () => {
  const menu = { courses: true, events: true };
  it("is the coach's button, with the label of her offer", () => {
    expect(
      resolveHeaderCta({ text: "Get Started", href: "/events" }, true, menu),
    ).toEqual({ text: "Book a class", href: "/events" });
  });
  it("is nothing when she turned the button off", () => {
    expect(resolveHeaderCta(null, true, menu)).toBeNull();
  });
  it("falls back to Contact when nothing is behind the destination", () => {
    const empty = { courses: false, events: false };
    expect(
      resolveHeaderCta({ text: "Get Started", href: "/courses" }, true, empty),
    ).toEqual({ text: "Get in touch", href: "/contact" });
    expect(
      resolveHeaderCta({ text: "Join", href: "/plans" }, false, menu),
    ).toEqual({ text: "Get in touch", href: "/contact" });
  });
});
