import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";

import { HelpBubble } from "@/components/shared/help-bubble";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { resolveHost } from "@/i18n/config";
import { TrackPageView } from "@shared/tracking/track-page-view";
import "@/styles/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const { locale } = resolveHost(host);
  if (locale === "tr") {
    return {
      title: "Contentor - İçeriklerinizi gelire dönüştürün",
      description:
        "Kurslar, canlı dersler ve daha fazlası için kendi markalı platformunuzu başlatın.",
    };
  }
  return {
    title: "Contentor - Monetize Your Content",
    description:
      "Launch your own branded platform for courses, live classes, and more.",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const { region, apex, otherApex } = resolveHost(host);
  const scheme = host.includes("localhost") ? "http" : "https";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="canonical" href={`${scheme}://${apex}`} />
        <link
          rel="alternate"
          hrefLang={locale === "en" ? "tr" : "en"}
          href={`${scheme}://${otherApex}`}
        />
        <link rel="alternate" hrefLang={locale} href={`${scheme}://${apex}`} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={`${scheme}://${region === "tr" ? otherApex : apex}`}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            themes={["light", "dim", "dark"]}
          >
            {children}
            <HelpBubble />
            <TrackPageView />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
