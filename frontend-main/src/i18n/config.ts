// Locale resolution. English is the only locale; the shape stays so one can be added back.

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

const APEX_HOSTS = ["contentor.app", "localhost"];

/** The marketing apex a request host belongs to (apex itself or a subdomain). */
export function apexFromHost(host: string): string {
  const h = (host || "").split(":")[0].toLowerCase();
  for (const apex of APEX_HOSTS) {
    if (h === apex || h.endsWith(`.${apex}`)) return apex;
  }
  return "localhost";
}
