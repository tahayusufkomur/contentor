import { describe, expect, it } from "vitest";
import { siteSlug } from "@/lib/slug";

describe("siteSlug mirrors Django's slugify", () => {
  // Audit R4: the preview must match the address the server makes (it
  // follows the name: backend/apps/core/onboarding/site_name.py, slugify(name)[:63]).
  it.each([
    ["Mira Yoga House", "mira-yoga-house"],
    ["  Görkem's Face Yoga Studio! ", "gorkems-face-yoga-studio"],
    ["Pilates & Co.", "pilates-co"],
    ["--Zen__Den--", "zen__den"],
    ["東京", ""],
  ])("%s → %s", (brand, slug) => {
    expect(siteSlug(brand)).toBe(slug);
  });
  it("is cut at 63 characters", () => {
    expect(siteSlug("a".repeat(80))).toHaveLength(63);
  });
});
