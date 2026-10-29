// Locale list: @shared/i18n/locales. The superadmin panel (/admin) stays English.
import { DEFAULT_LOCALE, LOCALES } from "@shared/i18n/locales";

export const locales = LOCALES;
export type Locale = string;
export const defaultLocale: Locale = DEFAULT_LOCALE;
