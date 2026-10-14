import { describe, expect, it } from "vitest";
import {
  featureCell,
  includedFeatures,
  planKeyFromName,
  type PlanSummary,
} from "@/lib/pricing-matrix";

const plan = (over: Partial<PlanSummary> = {}): PlanSummary => ({
  id: 1,
  name: "starter",
  is_free: false,
  currency: "USD",
  amount_cents: 1990,
  max_students: 100,
  max_storage_gb: 100,
  max_streaming_hours: 10,
  max_campaign_emails: 1000,
  transaction_fee_pct: "8.00",
  is_live_enabled: true,
  ...over,
});

// A locale read that must never happen for this cell.
const boom = () => {
  throw new Error("locale label read");
};

describe("planKeyFromName", () => {
  it("tolerates the seed's casings and rejects unknown plans", () => {
    expect(planKeyFromName("Free")).toBe("free");
    expect(planKeyFromName("starter")).toBe("starter");
    expect(planKeyFromName("PRO")).toBe("pro");
    expect(planKeyFromName("enterprise")).toBeNull();
  });
});

describe("includedFeatures", () => {
  it("keeps the locale list when the plans API is down", () => {
    expect([...includedFeatures(["students", "live"], null)]).toEqual(["students", "live"]);
  });
  it("follows the live record for live classes and campaigns", () => {
    const set = includedFeatures(
      ["students", "live"],
      plan({ is_live_enabled: false, max_campaign_emails: 500 }),
    );
    expect(set.has("live")).toBe(false);
    expect(set.has("campaigns")).toBe(true);
  });
});

describe("featureCell", () => {
  it("is a dash for a feature the plan lacks, without reading the locale", () => {
    expect(featureCell("campaigns", new Set(["students"]), null, boom)).toEqual({ kind: "no" });
  });
  it("is a check for a descriptive feature the plan has", () => {
    expect(featureCell("domain", new Set(["domain"]), null, boom)).toEqual({ kind: "yes" });
    expect(featureCell("live", new Set(["live"]), plan(), boom)).toEqual({ kind: "yes" });
  });
  it("labels quantities from the live record", () => {
    expect(featureCell("students", new Set(["students"]), plan({ max_students: 0 }), boom))
      .toEqual({ kind: "text", label: "Unlimited students" });
    expect(featureCell("fee", new Set(["fee"]), plan({ transaction_fee_pct: "6.00" }), boom))
      .toEqual({ kind: "text", label: "6% transaction fee" });
  });
  it("labels a granted campaign quota on a plan whose locale block has no campaigns key", () => {
    // The free plan's locale block lists no `campaigns` feature; if the live
    // record grants one, the label must come from the record, never next-intl.
    const free = plan({ name: "free", is_free: true, max_campaign_emails: 200 });
    const set = includedFeatures(["students", "storage"], free);
    expect(featureCell("campaigns", set, free, boom)).toEqual({
      kind: "text",
      label: "Email campaigns (200/mo)",
    });
  });
  it("falls back to the locale for a tier the record does not describe", () => {
    expect(featureCell("support", new Set(["support"]), plan(), () => "Priority support"))
      .toEqual({ kind: "text", label: "Priority support" });
    expect(featureCell("storage", new Set(["storage"]), null, () => "1 GB storage"))
      .toEqual({ kind: "text", label: "1 GB storage" });
  });
});
