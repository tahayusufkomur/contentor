import { getRequestConfig } from "next-intl/server";

import { defaultLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = defaultLocale;

  // Load namespaces in parallel
  const [marketing, pricing, auth, common] = await Promise.all([
    import(`../../messages/${locale}/marketing.json`).then((m) => m.default),
    import(`../../messages/${locale}/pricing.json`).then((m) => m.default),
    import(`../../messages/${locale}/auth.json`).then((m) => m.default),
    import(`../../messages/${locale}/common.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: { marketing, pricing, auth, common },
  };
});
