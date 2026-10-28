// Suffix for a marketplace subscription plan's billing cycle.
// 1 -> "/mo", 12 -> "/yr", other whole years -> "/N yr", else "/N mo".
// The words come from the caller's translator: `site.plan.*` on the public
// site and in the student area, `studio.plan.*` in the creator studio.
export type IntervalT = (
  key: "perMonth" | "perYear" | "perYears" | "perMonths",
  values?: { count: number },
) => string;

export function billingIntervalSuffix(
  months: number | null | undefined,
  t: IntervalT,
): string {
  const m = months ?? 1;
  if (m === 1) return t("perMonth");
  if (m === 12) return t("perYear");
  if (m % 12 === 0) return t("perYears", { count: m / 12 });
  return t("perMonths", { count: m });
}
