// Locale resolution for the tenant-facing portal; the list lives in @shared.
import {
  DEFAULT_LOCALE,
  LOCALES,
  resolveLocale as resolve,
} from "@shared/i18n/locales";

export const locales = LOCALES;
export type Locale = string;
export const defaultLocale: Locale = DEFAULT_LOCALE;

export function isValidLocale(
  value: string | undefined | null,
): value is Locale {
  return resolve(value) === value;
}

export const resolveLocale = resolve;
