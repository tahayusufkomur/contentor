import { describe, expect, it } from "vitest";
import { siteSlug } from "@/lib/slug";

describe("siteSlug mirrors Django's slugify", () => {
  // Audit R4: the address is permanent, so the preview must match what the
  // server creates (backend/apps/core/onboarding/views.py: slugify(brand)[:63]).
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
