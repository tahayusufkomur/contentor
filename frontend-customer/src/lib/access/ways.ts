import { currencySymbol } from "@/lib/format";

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
export function spanText(days: number): string {
  for (const [size, unit] of [
    [365, "year"],
    [30, "month"],
    [7, "week"],
    [1, "day"],
  ] as const) {
    if (days % size === 0) {
      const n = days / size;
      return `${n} ${unit}${n === 1 ? "" : "s"}`;
    }
  }
  return `${days} days`;
}

/** An ISO date as a local calendar date ("26 Oct 2026"); never via UTC midnight. */
function day(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function money(amount: string, currency: string): string {
  return `${currencySymbol(currency)}${Number(amount).toFixed(2)}`.replace(
    /\.00$/,
    "",
  );
}

/** The window as phrases; the two templates take a span such as "1 month". */
function clauses(
  w: Window | null,
  opensAfter: (span: string) => string,
  closesAfter: (span: string) => string,
): string[] {
  const out: string[] = [];
  if (w?.opens_after_days !== undefined)
    out.push(opensAfter(spanText(w.opens_after_days)));
  if (w?.opens_on) out.push(`from ${day(w.opens_on)}`);
  if (w?.closes_after_days !== undefined)
    out.push(closesAfter(spanText(w.closes_after_days)));
  if (w?.closes_on) out.push(`until ${day(w.closes_on)}`);
  return out;
}

function list(names: string[]): string {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The same sentence as the backend's `describe`. */
export function describe(
  ways: Ways,
  plans: AccessPayload["plans"],
  currency: string,
): string {
  const parts: string[] = [];
  if (ways.free) {
    const c = clauses(
      ways.free.window,
      (s) => `after ${s} of joining`,
      (s) => `for ${s} after joining`,
    );
    parts.push(c.length ? ["Free", ...c].join(" ") : "Free for everyone");
  }
  if (ways.buy) {
    const c = clauses(
      ways.buy.window,
      (s) => `opening ${s} after purchase`,
      (s) => `with ${s} of access`,
    );
    parts.push(
      `${money(ways.buy.price, currency)} once` +
        (c.length ? ` ${c.join(", ")}` : ", theirs to keep"),
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
        (s) => `after ${s} of membership`,
        (s) => `for ${s} of membership`,
      );
      const key = JSON.stringify(c);
      const group = groups.get(key) ?? { c, names: [] };
      group.names.push(name);
      groups.set(key, group);
    }
    parts.push(
      [...groups.values()]
        .map((g) => `in ${list(g.names)}${g.c.map((x) => ` ${x}`).join("")}`)
        .join(", "),
    );
  }
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function buyPill(w: Window | null): string {
  const opens = w?.opens_on
    ? `Opens ${day(w.opens_on)} · `
    : w?.opens_after_days !== undefined
      ? `Opens ${spanText(w.opens_after_days)} after purchase · `
      : "";
  const closes =
    w?.closes_after_days !== undefined
      ? `${spanText(w.closes_after_days)} from purchase`
      : w?.closes_on
        ? `Until ${day(w.closes_on)}`
        : "Forever";
  return opens + closes;
}

export function linkPill(w: Window | null): string {
  const opens =
    w?.opens_after_days !== undefined
      ? `After ${spanText(w.opens_after_days)} of membership`
      : w?.opens_on
        ? `From ${day(w.opens_on)}`
        : "Right away";
  const closes =
    w?.closes_after_days !== undefined
      ? `closes after ${spanText(w.closes_after_days)}`
      : w?.closes_on
        ? `closes ${day(w.closes_on)}`
        : "never closes";
  return `${opens} · ${closes}`;
}

export function freePill(w: Window | null): string {
  if (w?.closes_after_days !== undefined)
    return `First ${spanText(w.closes_after_days)} after joining`;
  if (w?.opens_on && w.closes_on)
    return `${day(w.opens_on)} – ${day(w.closes_on)}`;
  if (w?.closes_on) return `Until ${day(w.closes_on)}`;
  if (w?.opens_on) return `From ${day(w.opens_on)}`;
  if (w?.opens_after_days !== undefined)
    return `After ${spanText(w.opens_after_days)} of joining`;
  return "Always";
}

/**
 * What stops the creator from saving. `plansTicked` is the draft state of the
 * subscriptions box: ticked with nothing chosen is not yet a way.
 */
export function problems(
  ways: Ways,
  allowed: string[],
  plansTicked = false,
): { way: "buy" | "plans" | "all"; text: string }[] {
  const out: { way: "buy" | "plans" | "all"; text: string }[] = [];
  if (ways.buy && parsePrice(ways.buy.price) === null)
    out.push({ way: "buy", text: "Add a price above 0." });
  if (allowed.includes("plans") && plansTicked && !ways.plans.length)
    out.push({ way: "plans", text: "Tick at least one subscription." });
  if (!ways.free && !ways.buy && !ways.plans.length && !plansTicked)
    out.push({ way: "all", text: "Keep at least one way ticked." });
  return out;
}

/** A typed price ("49", "49,90") as "49.90", or null when it is not above 0. */
export function parsePrice(input: string): string | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n.toFixed(2) : null;
}
