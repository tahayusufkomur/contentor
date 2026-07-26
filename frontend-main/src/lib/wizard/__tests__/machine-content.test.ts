import { describe, expect, it } from "vitest";

import { buildContentSteps } from "@/lib/wizard/machine";
import type { WizardAnswers, WizardCatalog } from "@/lib/wizard/types";

const catalog = { page_layouts: {} } as unknown as WizardCatalog;
const ids = (a: WizardAnswers) =>
  buildContentSteps(catalog, a).map((s) => s.id);

describe("buildContentSteps", () => {
  it("always includes niche, describe, goals, course, logo, review", () => {
    expect(ids({ goals: [] })).toEqual([
      "business.niche",
      "business.describe",
      "business.goals",
      "content.course",
      "logo",
      "review",
    ]);
  });

  it("adds the event step only for live/onsite goals", () => {
    expect(ids({ goals: ["run_live_classes"] })).toContain("content.event");
    expect(ids({ goals: ["in_person_events"] })).toContain("content.event");
    expect(ids({ goals: ["sell_courses"] })).not.toContain("content.event");
  });

  it("adds the blog step only when blogging is a goal", () => {
    expect(ids({ goals: ["write_blog"] })).toContain("content.blog");
    expect(ids({ goals: ["sell_downloads"] })).not.toContain("content.blog");
  });

  it("inserts the followups step when followups exist", () => {
    const a: WizardAnswers = {
      goals: [],
      description_followups: { items: [{ q: "?", a: "" }] } as never,
    };
    expect(ids(a)).toContain("business.followups");
  });

  it("has no look.* or pages.* steps", () => {
    const all = ids({ goals: ["run_live_classes", "write_blog"] });
    expect(all.some((id) => id.startsWith("look."))).toBe(false);
    expect(all.some((id) => id.startsWith("pages."))).toBe(false);
  });

  it("orders content steps course -> event -> blog before logo and review", () => {
    const all = ids({ goals: ["run_live_classes", "write_blog"] });
    expect(all).toEqual([
      "business.niche",
      "business.describe",
      "business.goals",
      "content.course",
      "content.event",
      "content.blog",
      "logo",
      "review",
    ]);
  });
});
