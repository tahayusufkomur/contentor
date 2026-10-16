// The compare table's cells (spec 5.5), derived from the locale's per-plan
// lists and the live PlatformPlan records. Pure so vitest can pin it; the
// page only renders what this returns.

// No Free plan since 2026-10-16: new coaches start on a Starter trial.
export const PLAN_KEYS = ["starter", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** Row order of the compare table. */
export const FEATURE_KEYS = [
  "students",
  "storage",
  "courseBuilder",
  "live",
  "campaigns",
  "branding",
  "domain",
  "fee",
  "support",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Rows whose cell is a label (a quantity or a tier). The rest are a check
 * or a dash. */
const TEXT_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "students",
  "storage",
  "fee",
  "campaigns",
  "courseBuilder",
  "support",
]);

/** `GET /api/v1/billing/platform/plans/` item. */
export interface PlanSummary {
  id: number;
  name: string;
  is_free: boolean;
  currency: string;
  amount_cents: number | null;
  max_students: number;
  max_storage_gb: number;
  max_streaming_hours: number;
  max_campaign_emails: number;
  transaction_fee_pct: string;
  is_live_enabled: boolean;
}

export type Cell =
  | { kind: "text"; label: string }
  | { kind: "yes" }
  | { kind: "no" };

/** Maps PlatformPlan.name (the seed writes "starter", "pro"; the retired
 * "Free" has no column) to a column; null for a plan the page has no column
 * for. */
export function planKeyFromName(name: string): PlanKey | null {
  const lower = name.toLowerCase();
  return (PLAN_KEYS as readonly string[]).includes(lower)
    ? (lower as PlanKey)
    : null;
}

/** Features a plan includes: the locale's list, corrected by what the live
 * plan record actually grants (live classes, email campaigns). */
export function includedFeatures(
  base: readonly string[],
  plan: PlanSummary | null,
): Set<string> {
  const set = new Set(base);
  if (plan) {
    if (plan.is_live_enabled) set.add("live");
    else set.delete("live");
    if (plan.max_campaign_emails > 0) set.add("campaigns");
    else set.delete("campaigns");
  }
  return set;
}

/** A limit of 0 means "unlimited" across the platform plan model. */
function limitText(value: number, unit: string, plural: string): string {
  if (value <= 0) return `Unlimited ${plural}`;
  return `${value.toLocaleString()} ${unit}`;
}

/** Quantitative labels come from the live plan record; descriptive ones
 * (course builder, support) return null and fall back to the locale. */
export function dynamicFeatureLabel(
  featureKey: string,
  plan: PlanSummary,
): string | null {
  switch (featureKey) {
    case "students":
      return plan.max_students <= 0
        ? "Unlimited students"
        : `Up to ${plan.max_students.toLocaleString()} students`;
    case "storage":
      return limitText(plan.max_storage_gb, "GB storage", "storage");
    case "fee":
      return `${Number(plan.transaction_fee_pct)}% transaction fee`;
    case "campaigns":
      return plan.max_campaign_emails <= 0
        ? "Email campaigns"
        : `Email campaigns (${plan.max_campaign_emails.toLocaleString()}/mo)`;
    default:
      return null;
  }
}

/** One cell. `localeLabel` is read only when the cell needs a label and the
 * plan record has none, so a feature absent from a plan's locale block (the
 * free plan has no `campaigns` key) is never looked up. */
export function featureCell(
  featureKey: FeatureKey,
  included: Set<string>,
  plan: PlanSummary | null,
  localeLabel: () => string,
): Cell {
  if (!included.has(featureKey)) return { kind: "no" };
  if (!TEXT_FEATURES.has(featureKey)) return { kind: "yes" };
  const dynamic = plan ? dynamicFeatureLabel(featureKey, plan) : null;
  return { kind: "text", label: dynamic ?? localeLabel() };
}
