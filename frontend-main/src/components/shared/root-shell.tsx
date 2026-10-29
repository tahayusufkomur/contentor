import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";

import { HelpBubble } from "@/components/shared/help-bubble";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { BASE_URL, pageMetadata } from "@/lib/seo";
import { NavigationProvider } from "@shared/navigation/navigation-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { TrackPageView } from "@shared/tracking/track-page-view";

// What a page without its own head shows (the landing, /dashboard, /signup/verify);
// it names no canonical or other languages, which only the pages that have them do.
export async function generateMetadata(): Promise<Metadata> {
  return {
    // Absolute URLs for the share-card tags; prod sets NEXT_PUBLIC_BASE_DOMAIN.
    metadataBase: new URL(BASE_URL),
    // No title.template: blog pages already set "… — Contentor" in full.
    ...(await pageMetadata(await getLocale(), "/", "marketing.meta", {
      withAlternates: false,
    })),
  };
}

/** <html>, <body> and the providers, for the root layout of each surface
 * (app/(site) and app/(admin)). Two root layouts, not one shared one: Next does
 * not re-render a shared layout on a soft navigation, so one layout would carry
 * the messages and <html lang> of /tr/... into /admin. Crossing between the
 * root layouts is a full page load. */
export async function RootShell({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
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
