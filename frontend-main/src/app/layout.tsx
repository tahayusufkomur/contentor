import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { Toaster } from "sonner";

import { HelpBubble } from "@/components/shared/help-bubble";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { apexFromHost } from "@/i18n/config";
import { NavigationProvider } from "@shared/navigation/navigation-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { TrackPageView } from "@shared/tracking/track-page-view";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Contentor - Monetize Your Content",
  description:
    "Launch your own branded site for courses, live classes, and more.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const apex = apexFromHost(host);
  const scheme = host.includes("localhost") ? "http" : "https";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="canonical" href={`${scheme}://${apex}`} />
        <link rel="alternate" hrefLang={locale} href={`${scheme}://${apex}`} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={`${scheme}://${apex}`}
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
            <NavigationProvider>
              <NavigationProgress />
              {children}
              <HelpBubble />
              <Toaster position="top-center" richColors />
              <TrackPageView />
            </NavigationProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
