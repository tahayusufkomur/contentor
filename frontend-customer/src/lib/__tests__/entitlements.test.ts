// isFeatureLocked decides whether a coach-admin "Paid" badge should show for a
// feature. It must show ONLY when we KNOW the plan lacks the feature — never
// while entitlements are still loading (null), so the badge never flashes on
// for a paying coach before their real plan resolves.

import { describe, expect, it } from "vitest";

import { isFeatureLocked, type Entitlements } from "@/lib/entitlements";

const ALL_FALSE: Entitlements = {
  live: false,
  ai_blog: false,
  student_bot: false,
  logo_studio: false,
  payouts: false,
  platform_mailbox: false,
};

describe("isFeatureLocked", () => {
  it("locks a feature the loaded plan does not include", () => {
    expect(isFeatureLocked(ALL_FALSE, "live")).toBe(true);
    expect(isFeatureLocked(ALL_FALSE, "ai_blog")).toBe(true);
  });

  it("does not lock a feature the loaded plan includes", () => {
    const entitlements: Entitlements = { ...ALL_FALSE, live: true };
    expect(isFeatureLocked(entitlements, "live")).toBe(false);
  });

  it("does not lock while entitlements are still loading (null)", () => {
    expect(isFeatureLocked(null, "live")).toBe(false);
    expect(isFeatureLocked(null, "ai_blog")).toBe(false);
  });
});
