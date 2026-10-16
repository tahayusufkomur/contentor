import { describe, expect, it } from "vitest";
import { planKeyFromName, teaserRows, type PlansResponse } from "@/lib/plans";

const plan = (name: string, amount_cents: number | null, currency = "USD") => ({
  id: 1,
  name,
  is_free: amount_cents === null || amount_cents === 0,
  currency,
  amount_cents,
  max_students: 10,
  max_storage_gb: 1,
  max_streaming_hours: 0,
  max_campaign_emails: 0,
  transaction_fee_pct: "8",
  is_live_enabled: false,
});

describe("teaserRows", () => {
  it("renders names only when the API did not answer (Review Focus 5)", () => {
    expect(teaserRows(null)).toEqual([
      { key: "starter", price: null },
      { key: "pro", price: null },
    ]);
  });
  it("formats live prices in plan order, whatever the API's casing", () => {
    const data: PlansResponse = {
      region: "us",
      currency: "USD",
      plans: [plan("pro", 4990), plan("Free", null), plan("starter", 1990)],
    };
    // The retired Free plan has no row, even if an old API still lists it.
    expect(teaserRows(data)).toEqual([
      { key: "starter", price: "$19.90" },
      { key: "pro", price: "$49.90" },
    ]);
  });
  it("leaves a plan the API renamed without a price instead of throwing", () => {
    const data: PlansResponse = {
      region: "eu",
      currency: "EUR",
      plans: [plan("starter", 1990, "EUR"), plan("business", 9900, "EUR")],
    };
    expect(teaserRows(data)).toEqual([
      { key: "starter", price: "€19.90" },
      { key: "pro", price: null },
    ]);
  });
});

describe("planKeyFromName", () => {
  it("tolerates the seed's casings and rejects strangers", () => {
    expect(planKeyFromName("Free")).toBeNull(); // retired 2026-10-16
    expect(planKeyFromName("PRO")).toBe("pro");
    expect(planKeyFromName("enterprise")).toBeNull();
  });
});
