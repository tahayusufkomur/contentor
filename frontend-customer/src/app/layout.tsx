import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
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
import { UsageReporter } from "@/components/shared/usage-reporter";
import { getAuthUser } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/constants";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { getThemePalette } from "@/lib/themes";

// Routes that must stay reachable even when the site is unpublished, so the
// owner can log in to preview.
const GATE_BYPASS_PREFIXES = ["/login", "/callback", "/impersonate"];

async function isSiteGated(
  config: Awaited<ReturnType<typeof fetchTenantConfig>>,
  slug: string,
): Promise<boolean> {
  if (!config) return false;
  const published = (config.is_published ?? true) || config.is_demo === true;
  if (published) return false;

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  if (GATE_BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  const cookieStore = await cookies();
  if (
    cookieStore.get("contentor_preview")?.value === (config.tenant_slug || slug)
  )
    return false;

  const user = await getAuthUser();
  const isOwner = user?.role === "owner" || user?.role === "coach";
  return !isOwner;
}

import "@/styles/globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  // Expose the default font under its own variable so it never shadows the
  // tenant's `--font-sans` override (which is injected at :root by
  // TenantThemeStyle / the builder live preview). globals.css points
  // `--font-sans` at this as the fallback default.
  variable: "--font-instrument",
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
      // Tenant-branded favicon via the dynamic icon route — without an explicit
      // icon link the browser falls back to /favicon.ico, which 404s.
      icon: [
        { url: `/pwa-icon?size=32&v=${v}`, sizes: "32x32", type: "image/png" },
      ],
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
  // <tr-only-slug>.localhost), show a 404 instead of painting a partial page
  // whose API calls will all 404 against Django. We render the not-found page
  // ourselves rather than calling notFound() — notFound() is disallowed in the
  // root layout (NotAllowedRootNotFoundError), and fetchTenantConfig already
  // retries transient failures so this branch means the tenant truly is unknown.
  if (!config && slug !== "unknown") {
    const locale = await getLocale();
    return (
      <html lang={locale} className={instrumentSans.variable}>
        <body className="bg-cinematic min-h-screen font-sans antialiased">
          <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
            <h1 className="text-2xl font-semibold">Site not found</h1>
            <p className="text-muted-foreground max-w-md text-sm">
              There’s no Contentor site at this address. Check the link or
              contact the site owner.
            </p>
          </main>
        </body>
      </html>
    );
  }
  const gated = await isSiteGated(config, slug);
  const hasSession = Boolean((await cookies()).get(COOKIE_NAME)?.value);
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={instrumentSans.variable}
      suppressHydrationWarning
    >
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
        className={`bg-cinematic min-h-screen font-sans antialiased`}
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
                <PreviewGate
                  brandName={config?.brand_name}
                  hasPassword={config?.has_preview_password}
                />
              ) : (
                <>
                  <RedirectToast />
                  <DemoBanner />
                  {children}
                  <InstallPrompt />
                  <SwUpdateToast />
                  <PushOptIn />
                  <UsageReporter authed={hasSession} />
                </>
              )}
            </TenantProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
