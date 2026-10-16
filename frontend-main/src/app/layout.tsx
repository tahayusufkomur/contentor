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
import { BASE_DOMAIN } from "@/lib/constants";
import { NavigationProvider } from "@shared/navigation/navigation-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { TrackPageView } from "@shared/tracking/track-page-view";
import "@/styles/globals.css";

const TITLE = "Contentor — Teach what you love, and make a living from it";
const DESCRIPTION =
  "Your own site, classes students come back to, and payments that go straight to you. Set up in an afternoon, with help at every step.";
// public/og.jpg: scripts/footage/og-image.mjs renders it from the hero still.
const OG_IMAGE = {
  url: "/og.jpg",
  width: 1200,
  height: 630,
  alt: "Contentor — a yoga teacher guiding a student in a sunlit studio",
};

export const metadata: Metadata = {
  // Absolute URLs for the share-card tags; prod sets NEXT_PUBLIC_BASE_DOMAIN.
  metadataBase: new URL(
    BASE_DOMAIN === "localhost" ? "http://localhost" : `https://${BASE_DOMAIN}`,
  ),
  // No title.template: blog pages already set "… — Contentor" in full.
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Contentor",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
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
        {/* The site has its own dark theme: Dark Reader leaves it (and the
            logo's colours) alone instead of re-inverting it. */}
        <meta name="darkreader-lock" />
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
            themes={["light", "dark"]}
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
