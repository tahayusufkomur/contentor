import { cookies } from "next/headers";
import { getLocale, getMessages } from "next-intl/server";
import { resolveLocale } from "@shared/i18n/locales";
import { SiteLocaleBoundary } from "@shared/i18n/site-preview";

import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { OwnerLocales } from "./creator-scope";
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

/** The public site with the owner's tools on it (site+owner, see surface.ts):
 *  the page speaks the site's language and AsCreator/AsSite say where the
 *  creator's formats apply. Her language is read as request.ts reads it. */
export async function OwnerIntl({ children }: { children: React.ReactNode }) {
  const [site, cookieStore] = await Promise.all([getLocale(), cookies()]);
  return (
    <OwnerLocales
      creator={resolveLocale(cookieStore.get("user-locale")?.value)}
      site={site}
    >
      {children}
    </OwnerLocales>
  );
}
