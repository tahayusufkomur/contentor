import { getLocale, getMessages } from "next-intl/server";
import { resolveLocale } from "@shared/i18n/locales";
import { SiteLocaleBoundary } from "@shared/i18n/site-preview";

import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
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

/** Studio layouts (admin, setup): the studio speaks the creator's language, but
 *  its previews (SitePreview) show the site's, as students will see it. */
export async function StudioSiteLocale({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await fetchTenantConfig(await getTenantSlug());
  return (
    <SiteLocaleBoundary locale={resolveLocale(config?.default_locale)}>
      {children}
    </SiteLocaleBoundary>
  );
}
