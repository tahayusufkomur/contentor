import { describe, expect, it } from "vitest";
import { stickyCtaVisible } from "../sticky-cta";

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
