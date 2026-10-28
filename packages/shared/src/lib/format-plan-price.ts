/** Platform plan price, e.g. (USD, 1990) -> "$19.90"; whole amounts drop the cents. */
export function formatPlanPrice(
  currency: string,
  amountCents: number | null,
  locale: string,
): string {
  const amount = (amountCents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Plan rows are stored lowercase ("starter"); show them as "Starter". */
export function formatPlanName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
