"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { missingFallback } from "@shared/i18n/locales";

/** The server provider can't forward functions to client components, so the
 *  fallback and the error filter are set here, where client components read them. */
export function IntlProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  // Not AbstractIntlMessages: the typed messages hold string arrays (starters).
  messages: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages as AbstractIntlMessages}
      // `messages` is the language laid over English, so a key missing here is
      // missing in English too: log it once and show next-intl's path.
      getMessageFallback={(e) => missingFallback(locale, messages, e)}
      onError={(err) => {
        if (err.code !== "MISSING_MESSAGE") console.error(err);
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
