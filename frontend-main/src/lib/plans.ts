// Plan keys, the API's row shape and the landing teaser's rows. Pure: the
// fetch lives in plans-server.ts so this file is testable without a request.
import { formatPlanPrice } from "@shared/lib/format-plan-price";

export const PLAN_KEYS = ["free", "starter", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

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

export interface PlansResponse {
  region: string;
  currency: string;
  plans: PlanSummary[];
}

// Maps server-side PlatformPlan.name (lowercased) to a PLAN_KEY. The seed
// command writes "Free", "starter", "pro" — keep both casings tolerated.
export function planKeyFromName(name: string): PlanKey | null {
  const lower = name.toLowerCase();
  if (lower === "free") return "free";
  if (lower === "starter") return "starter";
  if (lower === "pro") return "pro";
  return null;
}

/** The landing's pricing teaser: one row per plan key, in plan order. `price`
 * is null when the API did not answer or did not return that plan, and the
 * teaser then shows the name alone (spec 5.4 ch. 8; never a crash). */
export function teaserRows(
  data: PlansResponse | null,
): { key: PlanKey; price: string | null }[] {
  const byKey = new Map<PlanKey, PlanSummary>();
  for (const p of data?.plans ?? []) {
    const key = planKeyFromName(p.name);
    if (key) byKey.set(key, p);
  }
  return PLAN_KEYS.map((key) => {
    const p = byKey.get(key);
    return {
      key,
      price: p ? formatPlanPrice(p.currency, p.amount_cents) : null,
    };
  });
}
