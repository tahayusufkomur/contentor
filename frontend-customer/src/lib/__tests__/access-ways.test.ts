import { describe as suite, expect, it } from "vitest";
import {
  buyPill,
  describe,
  freePill,
  linkPill,
  parsePrice,
  problems,
  spanText,
  type Ways,
} from "@/lib/access/ways";

const plans = [
  {
    id: 1,
    name: "Gold",
    price: "20.00",
    billing_interval_months: 1,
    is_active: true,
  },
  {
    id: 2,
    name: "Silver",
    price: "10.00",
    billing_interval_months: 1,
    is_active: true,
  },
];
const none: Ways = { free: null, buy: null, plans: [] };

suite("describe", () => {
  it("says it in plain words", () => {
    expect(describe({ ...none, free: { window: null } }, plans, "EUR")).toBe(
      "Free for everyone.",
    );
    expect(
      describe({ ...none, buy: { price: "29", window: null } }, plans, "EUR"),
    ).toBe("€29 once, theirs to keep.");
    expect(
      describe(
        {
          free: null,
          buy: { price: "49", window: { closes_after_days: 365 } },
          plans: [
            { plan_id: 1, window: { opens_after_days: 30 } },
            { plan_id: 2, window: { opens_after_days: 30 } },
          ],
        },
        plans,
        "EUR",
      ),
    ).toBe(
      "€49 once with 1 year of access; in Gold and Silver after 1 month of membership.",
    );
    expect(
      describe(
        {
          free: { window: { closes_on: "2026-10-26" } },
          buy: { price: "29", window: null },
          plans: [],
        },
        plans,
        "EUR",
      ),
    ).toBe("Free until 26 Oct 2026; €29 once, theirs to keep.");
    expect(
      describe(
        { ...none, plans: [{ plan_id: 1, window: null }] },
        plans,
        "EUR",
      ),
    ).toBe("In Gold.");
  });

  it("keeps cents, relative free windows and a delayed buy", () => {
    expect(
      describe({ ...none, buy: { price: "4.50", window: null } }, plans, "EUR"),
    ).toBe("€4.50 once, theirs to keep.");
    expect(
      describe(
        { ...none, free: { window: { closes_after_days: 7 } } },
        plans,
        "EUR",
      ),
    ).toBe("Free for 1 week after joining.");
    expect(
      describe(
        { ...none, buy: { price: "9", window: { opens_after_days: 14 } } },
        plans,
        "EUR",
      ),
    ).toBe("€9 once opening 2 weeks after purchase.");
  });
});

suite("spanText", () => {
  it("uses the largest exact unit", () => {
    expect(spanText(365)).toBe("1 year");
    expect(spanText(30)).toBe("1 month");
    expect(spanText(14)).toBe("2 weeks");
    expect(spanText(10)).toBe("10 days");
  });
});

suite("parsePrice", () => {
  it("reads a European price and refuses the rest", () => {
    expect(parsePrice("49,90")).toBe("49.90");
    for (const bad of ["0", "", "-5", "abc", "0,001", "0.004"])
      expect(parsePrice(bad)).toBeNull();
  });
});

suite("problems", () => {
  it("names what blocks a save", () => {
    expect(problems(none, ["free", "buy", "plans"])).toContainEqual({
      way: "all",
      text: "Keep at least one way ticked.",
    });
    expect(
      problems({ ...none, buy: { price: "0", window: null } }, ["buy"]),
    ).toContainEqual({ way: "buy", text: "Add a price above 0." });
    expect(problems(none, ["plans"], true)).toContainEqual({
      way: "plans",
      text: "Tick at least one subscription.",
    });
    expect(problems({ ...none, free: { window: null } }, ["free"])).toEqual([]);
  });
});

suite("pills", () => {
  it("buyPill", () => {
    expect(buyPill(null)).toBe("Forever");
    expect(buyPill({ closes_after_days: 365 })).toBe("1 year from purchase");
    expect(buyPill({ closes_on: "2026-12-31" })).toBe("Until 31 Dec 2026");
    expect(buyPill({ opens_on: "2026-11-01", closes_on: "2026-12-31" })).toBe(
      "Opens 1 Nov 2026 · Until 31 Dec 2026",
    );
  });
  it("linkPill", () => {
    expect(linkPill(null)).toBe("Right away · never closes");
    expect(linkPill({ opens_after_days: 30 })).toBe(
      "After 1 month of membership · never closes",
    );
  });
  it("freePill", () => {
    expect(freePill(null)).toBe("Always");
    expect(freePill({ closes_on: "2026-10-26" })).toBe("Until 26 Oct 2026");
    expect(freePill({ closes_on: "2026-09-05" })).toBe("Until 5 Sep 2026");
    expect(freePill({ opens_on: "2026-10-20", closes_on: "2026-11-02" })).toBe(
      "20 Oct 2026 – 2 Nov 2026",
    );
    expect(freePill({ closes_after_days: 7 })).toBe(
      "First 1 week after joining",
    );
  });
});
