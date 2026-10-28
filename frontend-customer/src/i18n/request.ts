import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  mergeMessages,
  missingFallback,
  resolveLocale,
} from "@shared/i18n/locales";

import { getAuthUser } from "@/lib/auth";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { namespacesFor, surfaceOf } from "./surface";

type Messages = Record<string, unknown>;

// Messages that live in packages/shared are read from there, the rest here.
const SHARED = new Set(["site", "studio"]);

async function load(locale: string, ns: string): Promise<Messages> {
  try {
    return SHARED.has(ns)
      ? (await import(`@shared/i18n/messages/${locale}/${ns}.json`)).default
      : (await import(`../../messages/${locale}/${ns}.json`)).default;
  } catch (e) {
    // A language with no file for this namespace yet shows English. Anything
    // else (bad JSON, a broken alias, English itself missing) must be loud.
    if (locale !== "en" && (e as { code?: string }).code === "MODULE_NOT_FOUND")
      return {};
    throw e;
  }
}

async function loadNamespaces(locale: string, names: string[]) {
  const entries = await Promise.all(
    names.map(async (ns) => {
      const en = await load("en", ns);
      return [
        ns,
        locale === "en" ? en : mergeMessages(en, await load(locale, ns)),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const [h, cookieStore] = await Promise.all([headers(), cookies()]);
  const role = (await getAuthUser())?.role;
  const surface = surfaceOf(h.get("x-pathname") || "", h.get("x-embed"), role);
  const config = await fetchTenantConfig(await getTenantSlug());
  const siteLocale = resolveLocale(config?.default_locale);
  const creatorLocale = resolveLocale(cookieStore.get("user-locale")?.value);

  const ns = namespacesFor(surface);
  const [creator, site] = await Promise.all([
    loadNamespaces(creatorLocale, ns.creator),
    loadNamespaces(siteLocale, ns.site),
  ]);
  const locale = surface === "studio" ? creatorLocale : siteLocale;
  const messages = { ...site, ...creator };

  return {
    locale,
    messages,
    // Already English-filled, so only a key English lacks too gets here.
    getMessageFallback: (e) => missingFallback(locale, messages, e),
    onError: (err) => {
      if (err.code !== "MISSING_MESSAGE") console.error(err);
    },
  };
});
