import { describe, expect, it } from "vitest";

import { mockupSrcs } from "@shared/wizard/mockups";

describe("mockupSrcs", () => {
  it("tries the niche directory first, then the yoga fallback", () => {
    expect(mockupSrcs("belly_dance", "theme-ocean")).toEqual([
      "/wizard-mockups/belly_dance/theme-ocean.webp",
      "/wizard-mockups/yoga/theme-ocean.webp",
    ]);
  });

  it("returns a single candidate for yoga itself (no duplicate)", () => {
    expect(mockupSrcs("yoga", "hero-split")).toEqual([
      "/wizard-mockups/yoga/hero-split.webp",
    ]);
  });

  it("maps general to the yoga set", () => {
    expect(mockupSrcs("general", "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
  });

  it("maps undefined and unknown niches to the yoga set", () => {
    expect(mockupSrcs(undefined, "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
    expect(mockupSrcs("scuba_diving", "home-story")).toEqual([
      "/wizard-mockups/yoga/home-story.webp",
    ]);
  });
});
