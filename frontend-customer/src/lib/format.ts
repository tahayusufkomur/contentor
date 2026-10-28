export function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "$19.90" / "€19.90" — whole amounts drop the cents. */
export function formatMoney(
  amount: number | string,
  currency: string,
  locale: string,
): string {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

/** formatMoney split for prices that set the symbol small: "€29" → { symbol: "€", amount: "29" }. */
export function formatMoneyParts(
  amount: number | string,
  currency: string,
  locale: string,
): { symbol: string; amount: string } {
  const text = formatMoney(amount, currency, locale);
  const m = text.match(/^(\D*?)\s*(\d.*)$/);
  return m
    ? { symbol: m[1], amount: m[2] }
    : { symbol: currency, amount: text };
}

/** Just the symbol ("$", "€") for an input prefix. */
export function currencySymbol(currency: string, locale: string): string {
  try {
    return (
      new Intl.NumberFormat(locale, { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}
