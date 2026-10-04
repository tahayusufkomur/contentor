import { describe, expect, it } from "vitest";
import { blockerMeta, PUBLISH_BLOCKER_META } from "../publish-blockers";

describe("publish blockers", () => {
  it("labels every key the backend can return", () => {
    for (const key of ["look", "first_course", "first_event", "first_blog_post", "payouts"]) {
      expect(PUBLISH_BLOCKER_META[key]?.label).toBeTruthy();
    }
  });

  it("sends a free-plan coach to upgrade instead of to payouts", () => {
    const meta = blockerMeta("payouts", { onFreePlan: true });
    expect(meta.href).toBe("/admin/billing");
    expect(meta.label).toMatch(/Starter/);
    expect(blockerMeta("payouts").href).toBe("/admin/payouts");
  });

  it("never hides an unknown blocker", () => {
    expect(blockerMeta("some_new_rule").label).toBe("some new rule");
  });
});
