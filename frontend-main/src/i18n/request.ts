import { getRequestConfig } from "next-intl/server";

import { defaultLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = defaultLocale;

  // Load namespaces in parallel. `studio` serves the shared creator components
  // on /admin (English there); `site` is loaded so the types match the shared files.
  const [marketing, pricing, auth, common, site, studio] = await Promise.all([
    import(`../../messages/${locale}/marketing.json`).then((m) => m.default),
    import(`../../messages/${locale}/pricing.json`).then((m) => m.default),
    import(`../../messages/${locale}/auth.json`).then((m) => m.default),
    import(`../../messages/${locale}/common.json`).then((m) => m.default),
    import(`@shared/i18n/messages/${locale}/site.json`).then((m) => m.default),
    import(`@shared/i18n/messages/${locale}/studio.json`).then(
      (m) => m.default,
    ),
  ]);

  return {
    locale,
    messages: { marketing, pricing, auth, common, site, studio },
  };
});
