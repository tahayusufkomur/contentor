import { enabledLocales, nativeName } from "@shared/i18n/locales";

/** The signup form's "Site language" choices: every enabled language by its own
 * name, the page's language selected. */
export function siteLanguageOptions(pageLocale: string): {
  value: string;
  label: string;
  selected: boolean;
}[] {
  return enabledLocales().map((code) => ({
    value: code,
    label: nativeName(code),
    selected: code === pageLocale,
  }));
}
