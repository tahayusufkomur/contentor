import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/types/live";
import { eventPriceLabel } from "../kit";

type Priced = Pick<
  CalendarEvent,
  "pricing_type" | "price" | "currency" | "is_trial"
>;

// The student live-classes page hands over what /api/v1/live/ returns for a
// class: its price and pricing type, with the tenant's charge currency taken
// from access_info (the class itself has no currency field).
const liveClass = (over: Partial<Priced> = {}): Priced => ({
  pricing_type: "paid",
  price: "25.00",
  currency: "EUR",
  ...over,
});

describe("eventPriceLabel on a live class", () => {
  it("prints the tenant's currency, never a hard-coded dollar", () => {
    expect(eventPriceLabel(liveClass())).toBe("€25");
    expect(eventPriceLabel(liveClass({ currency: "GBP" }))).toBe("£25");
    expect(eventPriceLabel(liveClass({ currency: "USD" }))).toBe("$25");
  });

  it("keeps the cents the coach set instead of rounding to whole dollars", () => {
    expect(
      eventPriceLabel(liveClass({ price: "19.99", currency: "USD" })),
    ).toBe("$19.99");
  });

  it("says Members only for a membership class, whatever its price", () => {
    expect(eventPriceLabel(liveClass({ pricing_type: "subscription" }))).toBe(
      "Members only",
    );
  });

  it("reads a missing currency as USD, like the other price labels", () => {
    expect(eventPriceLabel(liveClass({ currency: undefined }))).toBe("$25");
  });

  it("labels the free first session of a weekly class, and only that one", () => {
    // The trial is free (pricing_type "free") but says what it is.
    expect(
      eventPriceLabel(liveClass({ pricing_type: "free", is_trial: true })),
    ).toBe("Free trial");
    expect(eventPriceLabel(liveClass({ is_trial: false }))).toBe("€25");
    expect(eventPriceLabel(liveClass({ pricing_type: "free" }))).toBe("Free");
  });
});
