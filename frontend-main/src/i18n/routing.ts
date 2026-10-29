import { defineRouting } from "next-intl/routing";
import { enabledLocales } from "@shared/i18n/locales";

// English is unprefixed (/pricing); the others get /tr/pricing. A language that
// is not enabled has no address, so its pages 404 and the rest show English.
export const routing = defineRouting({
  locales: enabledLocales(),
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeCookie: { name: "NEXT_LOCALE", maxAge: 31536000 },
});
