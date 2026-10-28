// Locale list: @shared/i18n/locales. The superadmin panel (/admin) stays English.
import { DEFAULT_LOCALE, LOCALES } from "@shared/i18n/locales";

export const locales = LOCALES;
export type Locale = string;
export const defaultLocale: Locale = DEFAULT_LOCALE;

const APEX_HOSTS = ["contentor.app", "localhost"];

/** The marketing apex a request host belongs to (apex itself or a subdomain). */
export function apexFromHost(host: string): string {
  const h = (host || "").split(":")[0].toLowerCase();
  for (const apex of APEX_HOSTS) {
    if (h === apex || h.endsWith(`.${apex}`)) return apex;
  }
  return "localhost";
}
