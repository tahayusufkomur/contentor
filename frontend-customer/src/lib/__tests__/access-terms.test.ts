import { describe, expect, it } from "vitest";
import {
  freeTerms,
  planTerms,
  purchaseTerms,
  stateLine,
} from "@/lib/access/terms";
import type { AccessInfo } from "@/types/billing";

const info = (over: Partial<AccessInfo>): AccessInfo => ({
  has_access: false,
  pricing_type: "paid",
  price: "49.00",
  currency: "EUR",
  access_reason: null,
  unlock_methods: ["purchase"],
  access_ends_at: null,
  opens_at: null,
  ...over,
});

describe("purchaseTerms", () => {
  it("says how long a purchase lasts", () => {
    expect(purchaseTerms(null)).toBe("Lifetime access");
    expect(purchaseTerms({ closes_after_days: 365 })).toBe("1 year of access");
    expect(purchaseTerms({ closes_after_days: 90 })).toBe("3 months of access");
    expect(purchaseTerms({ closes_on: "2026-12-31" })).toBe(
      "Access until 31 Dec 2026",
    );
  });

  it("says when a sale opens", () => {
    expect(
      purchaseTerms({ opens_on: "2026-11-01", closes_after_days: 365 }),
    ).toBe("Opens 1 Nov 2026 · 1 year of access");
    expect(purchaseTerms({ opens_after_days: 7 })).toBe(
      "Opens 1 week after purchase · Lifetime access",
    );
  });
});

describe("planTerms", () => {
  it("says when a membership includes it", () => {
    expect(planTerms(null)).toBe("Included right away");
    expect(planTerms({ opens_after_days: 30 })).toBe(
      "Opens after 1 month of membership",
    );
    expect(planTerms({ opens_on: "2026-11-01" })).toBe("Opens 1 Nov 2026");
  });

  it("adds how long it stays", () => {
    expect(planTerms({ closes_after_days: 90 })).toBe(
      "Included right away, for 3 months",
    );
    expect(planTerms({ opens_after_days: 30, closes_on: "2026-12-31" })).toBe(
      "Opens after 1 month of membership, until 31 Dec 2026",
    );
  });
});

describe("freeTerms", () => {
  it("says what free covers", () => {
    expect(freeTerms(null)).toBe("Free");
    expect(freeTerms({ closes_on: "2026-11-30" })).toBe(
      "Free until 30 Nov 2026",
    );
    expect(freeTerms({ opens_on: "2026-10-20", closes_on: "2026-11-02" })).toBe(
      "Free 20 Oct 2026 – 2 Nov 2026",
    );
    expect(freeTerms({ closes_after_days: 7 })).toBe(
      "Free for your first 1 week",
    );
    expect(freeTerms({ opens_on: "2026-11-01" })).toBe("Free from 1 Nov 2026");
  });
});

describe("stateLine", () => {
  const NOW = Date.parse("2026-10-19T12:00:00Z");

  it("tells a student when their access ends", () => {
    expect(
      stateLine(
        info({ has_access: true, access_ends_at: "2027-07-19T12:00:00Z" }),
        undefined,
        NOW,
      ),
    ).toBe("Your access ends on 19 Jul 2027");
  });

  it("tells a waiting member when it opens", () => {
    const waiting = info({ opens_at: "2026-11-08T12:00:00Z" });
    expect(stateLine(waiting, "Gold", NOW)).toBe(
      "Opens for you on 8 Nov 2026 with your Gold membership",
    );
    expect(stateLine(waiting, undefined, NOW)).toBe(
      "Opens for you on 8 Nov 2026",
    );
  });

  it("tells a student whose window closed", () => {
    expect(
      stateLine(
        info({ access_ends_at: "2027-07-19T12:00:00Z" }),
        undefined,
        Date.parse("2027-08-01T00:00:00Z"),
      ),
    ).toBe("Your access ended on 19 Jul 2027");
  });

  it("is empty when there is nothing to say", () => {
    expect(stateLine(info({}), undefined, NOW)).toBe("");
    expect(stateLine(info({ has_access: true }), undefined, NOW)).toBe("");
  });
});
