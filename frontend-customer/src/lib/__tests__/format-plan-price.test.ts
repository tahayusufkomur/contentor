import { describe, expect, it } from "vitest";
import { formatPlanPrice } from "@shared/lib/format-plan-price";

describe("formatPlanPrice", () => {
  it("keeps the cents so $19.90 never renders as $20", () => {
    expect(formatPlanPrice("USD", 1990)).toBe("$19.90");
    expect(formatPlanPrice("EUR", 4990)).toBe("€49.90");
  });

  it("drops cents on whole amounts", () => {
    expect(formatPlanPrice("USD", 1900)).toBe("$19");
  });
});
