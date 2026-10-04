import { describe, expect, it } from "vitest";
import { blockerMeta, PUBLISH_BLOCKER_META } from "../publish-blockers";

describe("publish blockers", () => {
  it("labels every key the backend can return", () => {
    for (const key of ["look", "first_course", "first_event", "first_blog_post", "payouts"]) {
      expect(PUBLISH_BLOCKER_META[key]?.label).toBeTruthy();
    }
  });

  it("never hides an unknown blocker", () => {
    expect(blockerMeta("some_new_rule").label).toBe("some new rule");
  });
});
