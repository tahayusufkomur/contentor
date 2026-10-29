import { getRequestConfig } from "next-intl/server";
import {
  mergeMessages,
  missingFallback,
  resolveLocale,
} from "@shared/i18n/locales";

type Messages = Record<string, unknown>;

// Messages that live in packages/shared are read from there, the rest here.
const SHARED = new Set(["site", "studio"]);
// `studio` serves the shared creator components on /admin (English there);
// `site` is loaded so the types match the shared files.
const NAMESPACES = [
  "marketing",
  "pricing",
  "auth",
  "common",
  "dashboard",
  "site",
  "studio",
];

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

export default getRequestConfig(async ({ requestLocale }) => {
  // The middleware says which language the address asked for. /admin is outside
  // it, so it has none and stays English.
  const locale = resolveLocale(await requestLocale);

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const en = await load("en", ns);
      return [
        ns,
        locale === "en" ? en : mergeMessages(en, await load(locale, ns)),
      ] as const;
    }),
  );
  const messages = Object.fromEntries(entries);

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
