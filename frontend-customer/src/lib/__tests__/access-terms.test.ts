import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import site from "@shared/i18n/messages/en/site.json";
import plSite from "@shared/i18n/messages/pl/site.json";
import {
  freeTerms as freeTermsIn,
  planTerms as planTermsIn,
  purchaseTerms as purchaseTermsIn,
  stateLine as stateLineIn,
} from "@/lib/access/terms";
import type { AccessInfo } from "@/types/billing";

type Win = Parameters<typeof purchaseTermsIn>[0];
const t = createTranslator({
  locale: "en",
  messages: { site },
  namespace: "site",
});
const purchaseTerms = (w: Win) => purchaseTermsIn(w, "en", t);
const planTerms = (w: Win) => planTermsIn(w, "en", t);
const freeTerms = (w: Win) => freeTermsIn(w, "en", t);
const stateLine = (i: AccessInfo, now?: number) => stateLineIn(i, "en", t, now);

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
    ).toBe("Opens 1 Nov 2026 · Access until 1 year after purchase");
    // The close counts from the purchase: opens after 1 month, closes at 3 is 2 months, not 3.
    expect(purchaseTerms({ opens_after_days: 30, closes_after_days: 90 })).toBe(
      "Opens 1 month after purchase · Access until 3 months after purchase",
    );
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
    expect(planTerms({ opens_after_days: 30, closes_after_days: 90 })).toBe(
      "Opens after 1 month of membership, until 3 months into membership",
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
    expect(freeTerms({ opens_after_days: 30, closes_after_days: 90 })).toBe(
      "Free after 1 month of joining, until 3 months after joining",
    );
  });
});

describe("stateLine", () => {
  const NOW = Date.parse("2026-10-19T12:00:00Z");

  it("tells a student when their access ends", () => {
    expect(
      stateLine(
        info({ has_access: true, access_ends_at: "2027-07-19T12:00:00Z" }),
        NOW,
      ),
    ).toBe("Your access ends on 19 Jul 2027");
  });

  it("tells a waiting member when it opens", () => {
    const waiting = info({ opens_at: "2026-11-08T12:00:00Z" });
    expect(stateLine(waiting, NOW)).toBe("Opens for you on 8 Nov 2026");
  });

  it("tells a student whose window closed", () => {
    expect(
      stateLine(
        info({ access_ends_at: "2027-07-19T12:00:00Z" }),
        Date.parse("2027-08-01T00:00:00Z"),
      ),
    ).toBe("Your access ended on 19 Jul 2027");
  });

  it("is empty when there is nothing to say", () => {
    expect(stateLine(info({}), NOW)).toBe("");
    expect(stateLine(info({ has_access: true }), NOW)).toBe("");
  });
});

// A span arrives as a finished string ("3 miesiące"), so no phrase may put it
// after a preposition that needs another case.
describe("free terms in Polish", () => {
  const pl = createTranslator({
    locale: "pl",
    messages: { site: plSite },
    namespace: "site",
  });
  it("keeps the span in the case it is written in", () => {
    expect(freeTermsIn({ closes_after_days: 365 }, "pl", pl)).toBe(
      "Bezpłatnie przez 1 rok od dołączenia",
    );
    expect(freeTermsIn({ opens_after_days: 90 }, "pl", pl)).toBe(
      "Bezpłatnie, gdy minie 3 miesiące od dołączenia",
    );
  });
});
