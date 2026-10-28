import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { cookies, headers } from "next/headers";
import { IntlProvider } from "@/i18n/provider";
import { getLocale, getMessages } from "next-intl/server";
import { ogLocale, resolveLocale } from "@shared/i18n/locales";

import { InstallPrompt } from "@/components/shared/install-prompt";
import { PreviewGate } from "@/components/shared/preview-gate";
import { RedirectToast } from "@/components/shared/redirect-toast";
import { PushOptIn } from "@/components/shared/push-optin";
import { SwUpdateToast } from "@/components/shared/sw-update-toast";
import { TenantThemeEnforcer } from "@/components/shared/tenant-theme-enforcer";
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style";
import {
  isAdminPath,
  lookPrimaryHex,
  siteLook,
  styleDefaultTheme,
  styleFontsHref,
  THEME_STORAGE_KEY,
} from "@/lib/site-styles";
import { TenantProvider } from "@/components/shared/tenant-provider";
import {
  AdminBrowserBar,
  AppToaster,
  ThemeProvider,
} from "@/components/shared/theme-provider";
import { UsageReporter } from "@/components/shared/usage-reporter";
import { NavigationProvider } from "@shared/navigation/navigation-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { getAuthUser } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/constants";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { TrackPageView } from "@shared/tracking/track-page-view";
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";

// Routes that must stay reachable even when the site is unpublished, so the
// owner can log in to preview.
const GATE_BYPASS_PREFIXES = [
  "/login",
  "/callback",
  "/impersonate",
  // A design drawn for the studio's Download: it opens only with a token the site signed.
  "/render/",
  // Dev-only design showcase (the page itself 404s in production).
  ...(process.env.NODE_ENV === "production" ? [] : ["/design-showcase"]),
];

async function isSiteGated(
  config: Awaited<ReturnType<typeof fetchTenantConfig>>,
  slug: string,
): Promise<boolean> {
  if (!config) return false;
  const published = config.is_published ?? true;
  if (published && !config.paused) return false;

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  if (GATE_BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  // The preview password opens an unpublished site, never a paused one.
  const cookieStore = await cookies();
  if (
    !config.paused &&
    cookieStore.get("contentor_preview")?.value === (config.tenant_slug || slug)
  )
    return false;

  const user = await getAuthUser();
  const isOwner = user?.role === "owner" || user?.role === "coach";
  return !isOwner;
}

import "@/styles/globals.css";

export const dynamic = "force-dynamic";

export async function generateViewport(): Promise<Viewport> {
  // The coach admin wears the app's own look, so the browser bar does too.
  if (isAdminPath((await headers()).get("x-pathname") || "")) {
    // Light at render time: the coach's light/dark choice lives in
    // localStorage, so the server cannot know it; AdminBrowserBar patches the
    // meta after hydration.
    return { themeColor: ADMIN_THEME_COLOR.light, viewportFit: "cover" };
  }
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  return {
    themeColor: lookPrimaryHex(config?.style, config?.palette),
    viewportFit: "cover",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const name = config?.brand_name || "Welcome";
  const v = config?.icon_id ?? config?.logo_id ?? "default";

  // An empty meta description reads as an unfinished site in search results:
  // fall back to the home hero's subheadline (the one sentence the coach wrote).
  const homeHero = config?.pages?.home?.blocks?.find(
    (b) => b.type === "hero",
  ) as { subheading?: string } | undefined;
  const description =
    config?.meta_description?.trim() || homeHero?.subheading?.trim() || "";

  return {
    // Inner pages set `title: "About"` and render "About · <Brand>".
    title: { default: name, template: `%s · ${name}` },
    description,
    // Link previews: the site's language, not the creator's.
    openGraph: { locale: ogLocale(resolveLocale(config?.default_locale)) },
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
      <html lang={locale} className={GeistSans.variable}>
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
  const siteStyle = config ? siteLook(config.style) : undefined;
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(COOKIE_NAME)?.value);
  // The coach admin wears the app's own look (the site's light/dark is shared).
  const inAdmin = isAdminPath((await headers()).get("x-pathname") || "");
  const authUser = hasSession ? await getAuthUser() : null;
  const isStaff = authUser?.role === "owner" || authUser?.role === "coach";
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={GeistSans.variable} suppressHydrationWarning>
      <head>
        {config && <TenantThemeStyle config={config} off={inAdmin} />}
        {siteStyle && (
          <link href={styleFontsHref(siteStyle)} rel="stylesheet" />
        )}
      </head>
      <body
        className={`bg-cinematic min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <IntlProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            storageKey={THEME_STORAGE_KEY}
            defaultTheme={
              siteStyle
                ? styleDefaultTheme(siteStyle, config?.palette)
                : "light"
            }
            themes={["light", "dark"]}
            // A "dim" stored before looks were light/dark only paints as dark,
            // from the first-paint script on (TenantThemeEnforcer rewrites it).
            value={{ light: "light", dark: "dark", dim: "dark" }}
            enableSystem={false}
            forcedTheme={
              config?.dark_mode_enabled === false
                ? siteStyle
                  ? styleDefaultTheme(siteStyle, config?.palette)
                  : "light"
                : undefined
            }
            disableTransitionOnChange
          >
            <TenantProvider config={config}>
              <NavigationProvider>
                <NavigationProgress />
                <TenantThemeEnforcer />
                <TrackPageView />
                <AppToaster />
                <AdminBrowserBar />
                {gated ? (
                  <PreviewGate
                    brandName={config?.brand_name}
                    hasPassword={config?.has_preview_password}
                    paused={config?.paused}
                  />
                ) : (
                  <>
                    <RedirectToast />
                    {children}
                    <InstallPrompt hide={isStaff} />
                    <SwUpdateToast />
                    <PushOptIn authed={hasSession} />
                    <UsageReporter authed={hasSession} />
                  </>
                )}
              </NavigationProvider>
            </TenantProvider>
          </ThemeProvider>
        </IntlProvider>
      </body>
    </html>
  );
}
