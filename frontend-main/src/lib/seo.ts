import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BASE_DOMAIN } from "@/lib/constants";
import { localizedHref } from "@/lib/locale-href";
import { DEFAULT_LOCALE, enabledLocales, ogLocale } from "@shared/i18n/locales";

/** Where contentor.app lives; the share-card and hreflang URLs are made absolute from it. */
export const BASE_URL =
  BASE_DOMAIN === "localhost" ? "http://localhost" : `https://${BASE_DOMAIN}`;

/** A page's canonical address and its address in every enabled language,
 * as paths (`metadataBase` makes them absolute). English is the x-default. */
export function alternates(path: string, locale: string) {
  const languages: Record<string, string> = {};
  for (const l of enabledLocales()) languages[l] = localizedHref(path, l);
  languages["x-default"] = localizedHref(path, DEFAULT_LOCALE);
  return { canonical: localizedHref(path, locale), languages };
}

// public/og.jpg: scripts/footage/og-image.mjs renders it from the hero's photo.
const OG_IMAGE = { url: "/og.jpg", width: 1200, height: 630 };

type MetaNamespace =
  | "marketing.meta"
  | "marketing.blogMeta"
  | "pricing.meta"
  | "auth.login.meta"
  | "auth.signup.meta";

/** The head of a page: its title and description (message keys `title` and
 * `description` under `namespace`), its other languages and its share card. */
export async function pageMetadata(
  locale: string,
  path: string,
  namespace: MetaNamespace,
  { withAlternates = true }: { withAlternates?: boolean } = {},
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const c = await getTranslations({ locale, namespace: "common.meta" });
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    ...(withAlternates && { alternates: alternates(path, locale) }),
    openGraph: {
      type: "website",
      siteName: "Contentor",
      locale: ogLocale(locale),
      title,
      description,
      images: [{ ...OG_IMAGE, alt: c("ogAlt") }],
    },
    twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  };
}
