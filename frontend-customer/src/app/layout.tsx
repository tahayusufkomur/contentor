import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { Toaster } from "sonner";

import { DemoBanner } from "@/components/shared/demo-banner";
import { RedirectToast } from "@/components/shared/redirect-toast";
import { TenantThemeEnforcer } from "@/components/shared/tenant-theme-enforcer";
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style";
import { TenantProvider } from "@/components/shared/tenant-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

import "@/styles/globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);

  return {
    title: config?.brand_name || "Welcome",
    description: config?.meta_description || "",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  // The customer app only ever runs on tenant subdomains. If the host doesn't
  // resolve to a registered Tenant (e.g. cross-region slug like
  // <tr-only-slug>.localhost), render 404 instead of painting a partial page
  // whose API calls will all 404 against Django.
  if (!config && slug !== "unknown") {
    notFound();
  }
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {config && <TenantThemeStyle config={config} />}
        {config?.font_family && (
          <link
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.font_family)}&display=swap`}
            rel="stylesheet"
          />
        )}
      </head>
      <body
        className={`${instrumentSans.variable} bg-cinematic min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            forcedTheme={
              config?.dark_mode_enabled === false ? "light" : undefined
            }
            disableTransitionOnChange
          >
            <TenantProvider config={config}>
              <TenantThemeEnforcer />
              <Toaster position="top-center" richColors />
              <RedirectToast />
              <DemoBanner />
              {children}
            </TenantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
