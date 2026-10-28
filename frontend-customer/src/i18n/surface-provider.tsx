import { getLocale, getMessages } from "next-intl/server";

import { IntlProvider } from "./provider";

/** One per surface layout (admin, setup, public, student, auth): crossing
 *  surfaces by a client-side navigation mounts a new one, so the language
 *  follows the surface even though the root layout persists. */
export async function SurfaceIntl({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <IntlProvider locale={locale} messages={messages}>
      {children}
    </IntlProvider>
  );
}
