import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { resolveLocale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("user-locale")?.value);

  const [admin, student, common, pwa] = await Promise.all([
    import(`../../messages/${locale}/admin.json`).then((m) => m.default),
    import(`../../messages/${locale}/student.json`).then((m) => m.default),
    import(`../../messages/${locale}/common.json`).then((m) => m.default),
    import(`../../messages/${locale}/pwa.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: { admin, student, common, pwa },
  };
});
