"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { isAdminPath, TENANT_THEME_SHEET_ID } from "@/lib/site-styles";
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";

/** The app's toasts: in the admin they follow its light/dark (on the site
 *  they are light, as they always were). */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  const admin = isAdminPath(usePathname());
  const dark = admin && resolvedTheme === "dark";
  return (
    <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} />
  );
}

/** The admin's browser bar follows the same light/dark (the layout paints the
 *  site's colour on a full load). */
export function AdminBrowserBar() {
  const { resolvedTheme } = useTheme();
  const admin = isAdminPath(usePathname());
  useEffect(() => {
    if (!admin) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        resolvedTheme === "dark" ? ADMIN_THEME_COLOR.dark : ADMIN_THEME_COLOR.light,
      );
  }, [admin, resolvedTheme]);
  return null;
}

const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** next-themes for the whole app: the site's toggle and the coach admin's are
 *  one light/dark choice. Under /admin the tenant's sheet is off (globals.css
 *  tokens show instead). The root layout does that on a full load; this keeps
 *  it right on in-app moves between the site and the admin, where it does not
 *  re-render. */
export function ThemeProvider({
  children,
  forcedTheme,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const admin = isAdminPath(usePathname());

  useBeforePaint(() => {
    const sheet = document.getElementById(TENANT_THEME_SHEET_ID);
    if (sheet) (sheet as HTMLStyleElement).media = admin ? "not all" : "";
  }, [admin]);

  // A site that disables dark mode for visitors is held light; the coach's
  // admin is never forced, so she can always choose.
  return (
    <NextThemesProvider
      {...props}
      forcedTheme={admin ? undefined : forcedTheme}
    >
      {children}
    </NextThemesProvider>
  );
}
