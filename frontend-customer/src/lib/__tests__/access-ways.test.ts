import { describe as suite, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import studio from "@shared/i18n/messages/en/studio.json";
import deStudio from "@shared/i18n/messages/de/studio.json";
import plStudio from "@shared/i18n/messages/pl/studio.json";
import {
  buyPill as buyPillIn,
  formatDay,
  describe,
  freePill as freePillIn,
  linkPill as linkPillIn,
  parsePrice,
  problems,
  spanText,
  type Ways,
  type WaysT,
} from "@/lib/access/ways";

type Win = Parameters<typeof buyPillIn>[0];
const t = createTranslator({
  locale: "en",
  messages: { studio },
  namespace: "studio",
});
const buyPill = (w: Win) => buyPillIn(w, "en", t);
const linkPill = (w: Win) => linkPillIn(w, "en", t);
const freePill = (w: Win) => freePillIn(w, "en", t);

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
    expect(
      describe({ ...none, free: { window: null } }, plans, "EUR", "en", t),
    ).toBe("Free for everyone.");
    expect(
      describe(
        { ...none, buy: { price: "29", window: null } },
        plans,
        "EUR",
        "en",
        t,
      ),
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
        "en",
        t,
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
        "en",
        t,
      ),
    ).toBe("Free until 26 Oct 2026; €29 once, theirs to keep.");
    expect(
      describe(
        { ...none, plans: [{ plan_id: 1, window: null }] },
        plans,
        "EUR",
        "en",
        t,
      ),
    ).toBe("In Gold.");
  });

  it("keeps cents, relative free windows and a delayed buy", () => {
    expect(
      describe(
        { ...none, buy: { price: "4.50", window: null } },
        plans,
        "EUR",
        "en",
        t,
      ),
    ).toBe("€4.50 once, theirs to keep.");
    expect(
      describe(
        { ...none, free: { window: { closes_after_days: 7 } } },
        plans,
        "EUR",
        "en",
        t,
      ),
    ).toBe("Free for 1 week after joining.");
    expect(
      describe(
        { ...none, buy: { price: "9", window: { opens_after_days: 14 } } },
        plans,
        "EUR",
        "en",
        t,
      ),
    ).toBe("€9 once opening 2 weeks after purchase.");
    // The same sentence as the backend once both ends are spans.
    const both = { opens_after_days: 30, closes_after_days: 90 };
    expect(
      describe(
        { ...none, buy: { price: "49", window: both } },
        plans,
        "EUR",
        "en",
        t,
      ),
    ).toBe(
      "€49 once opening 1 month after purchase, until 3 months after purchase.",
    );
  });
});

suite("spanText", () => {
  it("uses the largest exact unit", () => {
    expect(spanText(365, t)).toBe("1 year");
    expect(spanText(30, t)).toBe("1 month");
    expect(spanText(14, t)).toBe("2 weeks");
    expect(spanText(10, t)).toBe("10 days");
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
    expect(problems(none, ["free", "buy", "plans"], false, t)).toContainEqual({
      way: "all",
      text: "Keep at least one way ticked.",
    });
    expect(
      problems(
        { ...none, buy: { price: "0", window: null } },
        ["buy"],
        false,
        t,
      ),
    ).toContainEqual({ way: "buy", text: "Add a price above 0." });
    expect(problems(none, ["plans"], true, t)).toContainEqual({
      way: "plans",
      text: "Tick at least one subscription.",
    });
    expect(
      problems({ ...none, free: { window: null } }, ["free"], false, t),
    ).toEqual([]);
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
    expect(freePill({ opens_after_days: 30, closes_after_days: 90 })).toBe(
      "After 1 month of joining · until 3 months after joining",
    );
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

suite("dates and prices follow the locale", () => {
  it("names the month in the locale and keeps day-month-year", () => {
    expect(formatDay("2026-10-26", "en")).toBe("26 Oct 2026");
    expect(formatDay("2026-11-05", "tr")).toBe("5 Kas 2026");
    expect(buyPillIn({ closes_on: "2026-11-05" }, "tr", t)).toBe(
      "Until 5 Kas 2026",
    );
  });

  it("prices the way the locale does", () => {
    expect(
      describe(
        { ...none, buy: { price: "4.50", window: null } },
        plans,
        "EUR",
        "de",
        t,
      ).replace(/\s/g, " "),
    ).toBe("4,50 € once, theirs to keep.");
  });
});

suite("a counted span is owned by its sentence", () => {
  // The span is never rendered on its own and pasted into another message:
  // in de and pl the unit changes case with the sentence around it.
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const spy = ((key: string, values?: Record<string, unknown>) => {
    calls.push([key, values]);
    return key;
  }) as unknown as WaysT;
  const keyed = () => calls.map(([key, values]) => [key, values?.count]);

  it("describe passes count and unit to the context", () => {
    calls.length = 0;
    describe(
      {
        free: { window: { opens_after_days: 14 } },
        buy: { price: "49", window: { closes_after_days: 90 } },
        plans: [{ plan_id: 1, window: { closes_after_days: 7 } }],
      },
      plans,
      "EUR",
      "en",
      spy,
    );
    expect(keyed()).toEqual(
      expect.arrayContaining([
        ["access.phrase.freeOpensAfter.week", 2],
        ["access.phrase.buyClosesAfter.month", 3],
        ["access.phrase.planClosesAfter.week", 1],
      ]),
    );
    for (const [, values] of calls)
      expect(values ?? {}).not.toHaveProperty("span");
  });

  it("the pills pass count and unit too", () => {
    calls.length = 0;
    freePillIn({ opens_after_days: 30, closes_after_days: 90 }, "en", spy);
    buyPillIn({ opens_after_days: 7, closes_after_days: 365 }, "en", spy);
    linkPillIn({ opens_after_days: 2 }, "en", spy);
    expect(keyed()).toEqual(
      expect.arrayContaining([
        ["access.phrase.freePillAfter.month", 1],
        ["access.phrase.freeClosesUntil.month", 3],
        ["access.phrase.buyPillOpens.week", 1],
        ["access.phrase.buyPillCloses.year", 1],
        ["access.phrase.linkPillOpens.day", 2],
      ]),
    );
    for (const [, values] of calls) {
      expect(values ?? {}).not.toHaveProperty("span");
      expect(values ?? {}).not.toHaveProperty("opens");
    }
  });
});

suite("describe with three subscriptions", () => {
  it("lists them with the locale's own 'and' (English: an Oxford comma)", () => {
    const three = [
      ...plans,
      {
        id: 3,
        name: "Bronze",
        price: "5.00",
        billing_interval_months: 1,
        is_active: true,
      },
    ];
    expect(
      describe(
        {
          ...none,
          plans: [1, 2, 3].map((plan_id) => ({ plan_id, window: null })),
        },
        three,
        "EUR",
        "en",
        t,
      ),
    ).toBe("In Gold, Silver, and Bronze.");
  });
});

suite("de and pl read the span in the case its sentence needs", () => {
  const tr = (locale: string, messages: typeof studio) =>
    createTranslator({
      locale,
      messages: { studio: messages },
      namespace: "studio",
    });
  const de = tr("de", deStudio as typeof studio);
  const pl = tr("pl", plStudio as typeof studio);

  const buy90 = {
    ...none,
    buy: { price: "49", window: { closes_after_days: 90 } },
  };

  it("de: 'nach 2 Monaten', 'mit 3 Monaten'", () => {
    expect(
      freePillIn({ opens_after_days: 60, closes_after_days: 90 }, "de", de),
    ).toBe("Nach 2 Monaten ab Beitritt · bis 3 Monate nach dem Beitritt");
    expect(linkPillIn({ opens_after_days: 60 }, "de", de)).toBe(
      "Nach 2 Monaten Mitgliedschaft · schließt nie",
    );
    expect(buyPillIn({ closes_after_days: 7 }, "de", de)).toBe(
      "1 Woche ab Kauf",
    );
    expect(describe(buy90, plans, "EUR", "de", de).replace(/\s/g, " ")).toBe(
      "49 € einmalig mit 3 Monaten Zugang.",
    );
  });

  it("pl: 'po 2 miesiącach', 'Pierwsze 2 tygodnie'", () => {
    expect(
      freePillIn({ opens_after_days: 60, closes_after_days: 90 }, "pl", pl),
    ).toBe("Po 2 miesiącach od dołączenia · do 3 miesięcy po dołączeniu");
    expect(freePillIn({ closes_after_days: 7 }, "pl", pl)).toBe(
      "Pierwszy 1 tydzień po dołączeniu",
    );
    expect(freePillIn({ closes_after_days: 14 }, "pl", pl)).toBe(
      "Pierwsze 2 tygodnie po dołączeniu",
    );
    expect(describe(buy90, plans, "EUR", "pl", pl).replace(/\s/g, " ")).toBe(
      "49 € jednorazowo z 3 miesiącami dostępu.",
    );
  });
});
