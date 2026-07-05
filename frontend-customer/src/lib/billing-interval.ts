// Suffix for a marketplace subscription plan's billing cycle.
// 1 -> "/mo", 12 -> "/yr", other whole years -> "/N yr", else "/N mo".
export function billingIntervalSuffix(months?: number | null): string {
  const m = months ?? 1;
  if (m === 1) return "/mo";
  if (m === 12) return "/yr";
  if (m % 12 === 0) return `/${m / 12} yr`;
  return `/${m} mo`;
}
