import { describe, expect, it } from "vitest";
import { onDestination, stickyCtaVisible } from "../sticky-cta";

describe("stickyCtaVisible", () => {
  it("shows the sticky bar after the first screen, never over the footer", () => {
    expect(
      stickyCtaVisible({
        scrollY: 0,
        viewportHeight: 844,
        footerInView: false,
      }),
    ).toBe(false);
    expect(
      stickyCtaVisible({
        scrollY: 900,
        viewportHeight: 844,
        footerInView: false,
      }),
    ).toBe(true);
    expect(
      stickyCtaVisible({
        scrollY: 5000,
        viewportHeight: 844,
        footerInView: true,
      }),
    ).toBe(false);
  });
});

describe("onDestination", () => {
  it("is true on the destination and on the pages under it", () => {
    expect(onDestination("/courses", "/courses")).toBe(true);
    expect(onDestination("/courses/yoga-basics", "/courses")).toBe(true);
  });

  it("is false elsewhere, including a path that only shares a prefix", () => {
    expect(onDestination("/", "/courses")).toBe(false);
    expect(onDestination("/courses-archive", "/courses")).toBe(false);
    expect(onDestination("/about", undefined)).toBe(false);
    expect(onDestination(null, "/courses")).toBe(false);
  });
});
