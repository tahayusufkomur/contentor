import { describe, expect, it } from "vitest";

import {
  CHAPTERS,
  buildSteps,
  firstUnansweredStep,
  stepIndex,
} from "../machine";
import type { WizardCatalog } from "../types";

const catalog = {
  page_layouts: {
    home: [{ id: "a" }, { id: "b" }],
    pricing: [{ id: "a" }, { id: "b" }],
  },
} as unknown as WizardCatalog;

const ids = (answers = {}) => buildSteps(catalog, answers).map((s) => s.id);

describe("classic wizard steps", () => {
  it("has no menu, hero or per-page layout steps", () => {
    expect(ids()).toEqual([
      "business.niche",
      "business.describe",
      "business.goals",
      "look.theme",
      "look.font",
      "logo",
      "domain",
      "review",
    ]);
  });

  it("adds the follow-up questions only when there are any", () => {
    expect(
      ids({ description_followups: { for: "x", items: [{ q: "?", a: "" }] } }),
    ).toContain("business.followups");
  });

  it("has four chapters", () => {
    expect([...CHAPTERS]).toEqual(["business", "look", "logo", "launch"]);
  });
});

describe("resuming after a step was removed (Review Focus 1)", () => {
  const steps = buildSteps(catalog, {
    niche: "yoga",
    description: "",
    goals: ["sell_courses"],
    theme: "ocean",
  });

  it("an unknown saved step is not in the flow", () => {
    expect(steps.some((s) => s.id === "pages.home")).toBe(false);
    expect(steps.some((s) => s.id === "look.navbar")).toBe(false);
  });

  it("falls to the first unanswered step, never back to the niche question", () => {
    const answers = {
      niche: "yoga",
      description: "",
      goals: ["sell_courses"],
      theme: "ocean",
    };
    expect(firstUnansweredStep(steps, answers).id).toBe("look.font");
  });

  it("stepIndex of an unknown id is the start (callers must guard)", () => {
    expect(stepIndex(steps, "pages.home")).toBe(0);
  });
});
