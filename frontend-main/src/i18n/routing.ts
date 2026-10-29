import { defineRouting } from "next-intl/routing";
import { enabledLocales } from "@shared/i18n/locales";

// English is unprefixed (/pricing); the others get /tr/pricing. A language that
// is not enabled has no address, so its pages 404 and the rest show English.
export const routing = defineRouting({
  locales: enabledLocales(),
  defaultLocale: "en",
  localePrefix: "as-needed",
  // The page's own head tags (lib/seo.ts) say it; a header from the middleware
  // would add a second, host-derived answer that could disagree.
  alternateLinks: false,
  localeCookie: { name: "NEXT_LOCALE", maxAge: 31536000 },
});
