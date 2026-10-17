import { describe, expect, it } from "vitest";
import { SITE_STYLES } from "@shared/sections/styles";

const ASPECTS = ["3/4", "4/5", "1/1", "4/3", "3/2", "16/10"];

describe("coverAspect", () => {
  it("is one of the six card shapes on every look", () => {
    const looks = Object.values(SITE_STYLES);
    expect(looks).toHaveLength(21);
    for (const look of looks) {
      expect(ASPECTS, look.id).toContain(look.coverAspect);
    }
  });

  it("names the shape each look's course card draws", () => {
    expect(SITE_STYLES.atelier.coverAspect).toBe("3/4");
    expect(SITE_STYLES.encore.coverAspect).toBe("1/1");
  });
});
