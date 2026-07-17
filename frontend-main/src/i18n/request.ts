import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, type Locale, locales, resolveHost } from "./config";

export default getRequestConfig(async () => {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") || headerList.get("host") || "";
  const { locale: hostLocale } = resolveHost(host);
  const locale: Locale = (locales as readonly string[]).includes(hostLocale)
    ? (hostLocale as Locale)
    : defaultLocale;

  // Load namespaces in parallel
  const [marketing, pricing, auth, common, { wizard }] = await Promise.all([
    import(`../../messages/${locale}/marketing.json`).then((m) => m.default),
    import(`../../messages/${locale}/pricing.json`).then((m) => m.default),
    import(`../../messages/${locale}/auth.json`).then((m) => m.default),
    import(`../../messages/${locale}/common.json`).then((m) => m.default),
    import(`../../messages/${locale}/wizard.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: { marketing, pricing, auth, common, wizard },
  };
});
