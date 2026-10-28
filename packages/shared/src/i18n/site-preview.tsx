"use client";

import { createContext, useContext } from "react";
import {
  NextIntlClientProvider,
  useMessages,
  useTimeZone,
  type AbstractIntlMessages,
} from "next-intl";

import { missingFallback } from "./locales";

// The studio speaks the creator's language, but a preview inside it shows what
// students will see. The server layouts say which language that is (the
// site's); `site.*` messages are already in it (request.ts), so a preview only
// needs the locale (dates, money) and a `lang` attribute (CSS casing).
const SiteLocale = createContext<string | null>(null);

export function SiteLocaleBoundary({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return <SiteLocale.Provider value={locale}>{children}</SiteLocale.Provider>;
}

/** The site's language where a studio page sets one, else null (the page's own). */
export const useSiteLocale = () => useContext(SiteLocale);

function InSiteLocale({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const messages = useMessages() as unknown as Record<string, unknown>;
  const timeZone = useTimeZone();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages as AbstractIntlMessages}
      timeZone={timeZone}
      getMessageFallback={(e) => missingFallback(locale, messages, e)}
      onError={(err) => {
        if (err.code !== "MISSING_MESSAGE") console.error(err);
      }}
    >
      <div lang={locale} className="contents">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

/** Wrap what students would see. Without a boundary (the superadmin, the public
 *  site) it renders its children unchanged. */
export function SitePreview({ children }: { children: React.ReactNode }) {
  const locale = useSiteLocale();
  return locale ? (
    <InSiteLocale locale={locale}>{children}</InSiteLocale>
  ) : (
    <>{children}</>
  );
}
