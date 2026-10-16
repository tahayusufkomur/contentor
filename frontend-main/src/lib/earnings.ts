// The landing's earnings calculator: what a coach keeps a month after our
// transaction fee and her plan, before Stripe's own card fee. Pure, so the
// arithmetic is tested apart from the sliders.
import { planKeyFromName, type PlansResponse } from "@/lib/plans";

export type PaidPlan = "starter" | "pro";

export interface PlanTerms {
  /** Our cut of each sale, in percent. */
  feePct: number;
  /** The plan's monthly price, in whole currency units. */
  price: number;
}

/** Each paid plan's fee and price from the plans API; null when it did not answer. */
export function planTerms(
  data: PlansResponse | null,
): Record<PaidPlan, PlanTerms> | null {
  const terms: Partial<Record<PaidPlan, PlanTerms>> = {};
  for (const p of data?.plans ?? []) {
    const key = planKeyFromName(p.name);
    if (key === "starter" || key === "pro")
      terms[key] = {
        feePct: Number(p.transaction_fee_pct),
        price: (p.amount_cents ?? 0) / 100,
      };
  }
  return terms.starter && terms.pro
    ? (terms as Record<PaidPlan, PlanTerms>)
    : null;
}

export function earnings(students: number, price: number, plan: PlanTerms) {
  const gross = students * price;
  const fee = (gross * plan.feePct) / 100;
  const keep = Math.max(gross - fee - plan.price, 0);
  return { gross, fee, planPrice: plan.price, keep, yearly: keep * 12 };
}
