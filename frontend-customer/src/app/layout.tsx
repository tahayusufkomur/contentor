import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { Toaster } from "sonner";

import { DemoBanner } from "@/components/shared/demo-banner";
import { InstallPrompt } from "@/components/shared/install-prompt";
import { PreviewGate } from "@/components/shared/preview-gate";
import { RedirectToast } from "@/components/shared/redirect-toast";
import { PushOptIn } from "@/components/shared/push-optin";
import { SwUpdateToast } from "@/components/shared/sw-update-toast";
import { TenantThemeEnforcer } from "@/components/shared/tenant-theme-enforcer";
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style";
import { TenantProvider } from "@/components/shared/tenant-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { getAuthUser } from "@/lib/auth";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { getThemePalette } from "@/lib/themes";

// Routes that must stay reachable even when the site is unpublished, so the
// owner can log in to preview.
const GATE_BYPASS_PREFIXES = ["/login", "/callback", "/impersonate"];

async function isSiteGated(config: Awaited<ReturnType<typeof fetchTenantConfig>>, slug: string): Promise<boolean> {
  if (!config) return false;
  const published = (config.is_published ?? true) || config.is_demo === true;
  if (published) return false;

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  if (GATE_BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  const cookieStore = await cookies();
  if (cookieStore.get("contentor_preview")?.value === (config.tenant_slug || slug)) return false;

  const user = await getAuthUser();
  const isOwner = user?.role === "owner" || user?.role === "coach";
  return !isOwner;
}

import "@/styles/globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateViewport(): Promise<Viewport> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const theme = getThemePalette(config?.theme);

  return {
    themeColor: theme.primaryHex,
    viewportFit: "cover",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const name = config?.brand_name || "Welcome";
  const v = config?.logo_id ?? "default";

  return {
    title: name,
    description: config?.meta_description || "",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
    icons: {
      apple: [{ url: `/pwa-icon?size=180&v=${v}`, sizes: "180x180" }],
    },
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
  const gated = await isSiteGated(config, slug);
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
              {gated ? (
                <PreviewGate brandName={config?.brand_name} hasPassword={config?.has_preview_password} />
              ) : (
                <>
                  <RedirectToast />
                  <DemoBanner />
                  {children}
                  <InstallPrompt />
                  <SwUpdateToast />
                  <PushOptIn />
                </>
              )}
            </TenantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
