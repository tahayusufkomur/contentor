import { describe, expect, it } from "vitest";
import { earnings, planTerms } from "@/lib/earnings";
import type { PlanSummary } from "@/lib/plans";

const plan = (name: string, cents: number | null, fee: string) =>
  ({ name, amount_cents: cents, transaction_fee_pct: fee }) as PlanSummary;

describe("earnings", () => {
  it("keeps the sales minus our fee and the plan", () => {
    const e = earnings(40, 29, { feePct: 8, price: 19 });
    expect(e.gross).toBe(1160);
    expect(e.fee).toBeCloseTo(92.8);
    expect(e.keep).toBeCloseTo(1048.2);
    expect(e.yearly).toBeCloseTo(12578.4);
  });
  it("never goes below nothing", () => {
    expect(earnings(1, 5, { feePct: 6, price: 49 }).keep).toBe(0);
  });
});

describe("planTerms", () => {
  it("reads both paid plans' fee and price", () => {
    const data = {
      region: "global",
      currency: "USD",
      plans: [
        plan("Free", null, "0"),
        plan("starter", 1900, "8.00"),
        plan("pro", 4900, "6.00"),
      ],
    };
    expect(planTerms(data)).toEqual({
      starter: { feePct: 8, price: 19 },
      pro: { feePct: 6, price: 49 },
    });
  });
  it("is null when the API did not answer or a plan is missing", () => {
    expect(planTerms(null)).toBeNull();
    expect(
      planTerms({
        region: "",
        currency: "USD",
        plans: [plan("pro", 4900, "6")],
      }),
    ).toBeNull();
  });
});
