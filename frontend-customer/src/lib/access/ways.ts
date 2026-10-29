import type { useTranslations } from "next-intl";
import { formatDayMonth, formatMoney } from "@/lib/format";

export type Window = {
  opens_after_days?: number;
  opens_on?: string;
  closes_after_days?: number;
  closes_on?: string;
};

export type Ways = {
  free: { window: Window | null } | null;
  buy: { price: string; window: Window | null } | null;
  plans: { plan_id: number; window: Window | null }[];
};

export type AccessPayload = {
  kind: string;
  id: number;
  ways: Ways;
  describe: string;
  currency: string;
  allowed: string[];
  can_edit_plans: boolean;
  plans: {
    id: number;
    name: string;
    price: string;
    billing_interval_months: number;
    is_active: boolean;
  }[];
  bundles: { id: number; name: string; price: string }[];
};

/** Days in the largest exact unit: months are 30 days, a year 365. */
export function spanParts(days: number): {
  unit: "year" | "month" | "week" | "day";
  count: number;
} {
  for (const [size, unit] of [
    [365, "year"],
    [30, "month"],
    [7, "week"],
    [1, "day"],
  ] as const) {
    if (days % size === 0) return { unit, count: days / size };
  }
  return { unit: "day", count: days };
}

/** The `studio` translator: these sentences live under `studio.access.*`. */
export type WaysT = ReturnType<typeof useTranslations<"studio">>;

const SPAN_KEY = {
  year: "access.span.year",
  month: "access.span.month",
  week: "access.span.week",
  day: "access.span.day",
} as const;

/** The span in the creator's language ("3 months"). */
export function spanText(days: number, t: WaysT): string {
  const { unit, count } = spanParts(days);
  return t(SPAN_KEY[unit], { count });
}

/** An ISO date as "26 Oct 2026" (day, month, year in every language). */
export function formatDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return formatDayMonth(new Date(Date.UTC(y, m - 1, d)), locale, true, "UTC");
}

type Phrase = (span: string) => string;

/**
 * The window as phrases; the templates take a span such as "1 month". A span to
 * the close counts from when they got in, so once an opening is set it reads
 * `closesUntil`, not a length (as the backend's `_clauses`).
 */
function clauses(
  w: Window | null,
  phrases: { opensAfter: Phrase; closesAfter: Phrase; closesUntil: Phrase },
  locale: string,
  t: WaysT,
): string[] {
  const out: string[] = [];
  if (w?.opens_after_days !== undefined)
    out.push(phrases.opensAfter(spanText(w.opens_after_days, t)));
  if (w?.opens_on)
    out.push(
      t("access.describe.from", { date: formatDay(w.opens_on, locale) }),
    );
  if (w?.closes_after_days !== undefined) {
    const opens = w.opens_after_days !== undefined || !!w.opens_on;
    out.push(
      (opens ? phrases.closesUntil : phrases.closesAfter)(
        spanText(w.closes_after_days, t),
      ),
    );
  }
  if (w?.closes_on)
    out.push(
      t("access.describe.until", { date: formatDay(w.closes_on, locale) }),
    );
  return out;
}

/** The same sentence as the backend's `describe`. */
export function describe(
  ways: Ways,
  plans: AccessPayload["plans"],
  currency: string,
  locale: string,
  t: WaysT,
): string {
  const parts: string[] = [];
  if (ways.free) {
    const c = clauses(
      ways.free.window,
      {
        opensAfter: (span) => t("access.describe.freeOpensAfter", { span }),
        closesAfter: (span) => t("access.describe.freeClosesAfter", { span }),
        closesUntil: (span) => t("access.describe.freeClosesUntil", { span }),
      },
      locale,
      t,
    );
    parts.push(
      c.length
        ? t("access.describe.free", { window: c.join(" ") })
        : t("access.describe.freeAll"),
    );
  }
  if (ways.buy) {
    const c = clauses(
      ways.buy.window,
      {
        opensAfter: (span) => t("access.describe.buyOpens", { span }),
        closesAfter: (span) => t("access.describe.buyClosesAfter", { span }),
        closesUntil: (span) => t("access.describe.buyClosesUntil", { span }),
      },
      locale,
      t,
    );
    const price = formatMoney(ways.buy.price, currency, locale);
    parts.push(
      c.length
        ? t("access.describe.buy", { price, window: c.join(", ") })
        : t("access.describe.buyKeep", { price }),
    );
  }
  if (ways.plans.length) {
    const names = new Map(plans.map((p) => [p.id, p.name]));
    const groups = new Map<string, { c: string[]; names: string[] }>();
    for (const p of ways.plans) {
      const name = names.get(p.plan_id);
      if (name === undefined) continue;
      const c = clauses(
        p.window,
        {
          opensAfter: (span) => t("access.describe.planOpens", { span }),
          closesAfter: (span) => t("access.describe.planClosesAfter", { span }),
          closesUntil: (span) => t("access.describe.planClosesUntil", { span }),
        },
        locale,
        t,
      );
      const key = JSON.stringify(c);
      const group = groups.get(key) ?? { c, names: [] };
      group.names.push(name);
      groups.set(key, group);
    }
    const and = new Intl.ListFormat(locale, { type: "conjunction" });
    parts.push(
      [...groups.values()]
        .map((g) =>
          g.c.length
            ? t("access.describe.inPlansWindow", {
                plans: and.format(g.names),
                window: g.c.join(" "),
              })
            : t("access.describe.inPlans", { plans: and.format(g.names) }),
        )
        .join(", "),
    );
  }
  const text = parts.join("; ");
  return `${text.charAt(0).toLocaleUpperCase(locale)}${text.slice(1)}.`;
}

export function buyPill(w: Window | null, locale: string, t: WaysT): string {
  const opens = w?.opens_on
    ? `${t("access.pill.buy.opensOn", { date: formatDay(w.opens_on, locale) })} · `
    : w?.opens_after_days !== undefined
      ? `${t("access.pill.buy.opensAfter", { span: spanText(w.opens_after_days, t) })} · `
      : "";
  const closes =
    w?.closes_after_days !== undefined
      ? t("access.pill.buy.closesAfter", {
          span: spanText(w.closes_after_days, t),
        })
      : w?.closes_on
        ? t("access.pill.until", { date: formatDay(w.closes_on, locale) })
        : t("access.pill.buy.forever");
  return opens + closes;
}

export function linkPill(w: Window | null, locale: string, t: WaysT): string {
  const opens =
    w?.opens_after_days !== undefined
      ? t("access.pill.link.opensAfter", {
          span: spanText(w.opens_after_days, t),
        })
      : w?.opens_on
        ? t("access.pill.from", { date: formatDay(w.opens_on, locale) })
        : t("access.pill.link.now");
  const closes =
    w?.closes_after_days !== undefined
      ? t("access.pill.link.closesAfter", {
          span: spanText(w.closes_after_days, t),
        })
      : w?.closes_on
        ? t("access.pill.link.closesOn", {
            date: formatDay(w.closes_on, locale),
          })
        : t("access.pill.link.never");
  return `${opens} · ${closes}`;
}

export function freePill(w: Window | null, locale: string, t: WaysT): string {
  const day = (iso: string) => formatDay(iso, locale);
  if (w?.closes_after_days !== undefined) {
    // With an opening, the close (counted from joining) is a point, not a length.
    const closes = spanText(w.closes_after_days, t);
    if (w.opens_after_days !== undefined)
      return t("access.pill.free.afterThenUntil", {
        opens: spanText(w.opens_after_days, t),
        closes,
      });
    if (w.opens_on)
      return t("access.pill.free.fromThenUntil", {
        opens: day(w.opens_on),
        closes,
      });
    return t("access.pill.free.first", { closes });
  }
  if (w?.opens_on && w.closes_on)
    return t("access.pill.free.between", {
      opens: day(w.opens_on),
      closes: day(w.closes_on),
    });
  if (w?.closes_on) return t("access.pill.until", { date: day(w.closes_on) });
  if (w?.opens_on) return t("access.pill.from", { date: day(w.opens_on) });
  if (w?.opens_after_days !== undefined)
    return t("access.pill.free.after", {
      opens: spanText(w.opens_after_days, t),
    });
  return t("access.pill.free.always");
}

/**
 * What stops the creator from saving. `plansTicked` is the draft state of the
 * subscriptions box: ticked with nothing chosen is not yet a way.
 */
export function problems(
  ways: Ways,
  allowed: string[],
  plansTicked: boolean,
  t: WaysT,
): { way: "buy" | "plans" | "all"; text: string }[] {
  const out: { way: "buy" | "plans" | "all"; text: string }[] = [];
  if (ways.buy && parsePrice(ways.buy.price) === null)
    out.push({ way: "buy", text: t("access.problems.price") });
  if (allowed.includes("plans") && plansTicked && !ways.plans.length)
    out.push({ way: "plans", text: t("access.problems.plans") });
  if (!ways.free && !ways.buy && !ways.plans.length && !plansTicked)
    out.push({ way: "all", text: t("access.problems.none") });
  return out;
}

/** A typed price ("49", "49,90") as "49.90", or null when it is not above 0. */
export function parsePrice(input: string): string | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const out = Number(text).toFixed(2);
  return Number(out) > 0 ? out : null;
}
