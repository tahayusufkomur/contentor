"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

import {
  ADMIN_THEME_COOKIE,
  isAdminPath,
  TENANT_THEME_SHEET_ID,
} from "@/lib/site-styles";

export type AdminTheme = "light" | "dark";

const AdminThemeContext = createContext<{
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
}>({ theme: "light", setTheme: () => {} });

/** The coach admin's own light/dark choice (the site's is `useTheme`). */
export const useAdminTheme = () => useContext(AdminThemeContext);

/** The app's toasts: in the admin they follow its light/dark (on the site
 *  they are light, as they always were). */
export function AppToaster() {
  const { theme } = useAdminTheme();
  const admin = isAdminPath(usePathname());
  return (
    <Toaster position="top-center" richColors theme={admin ? theme : "light"} />
  );
}

const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** next-themes for the tenant's site, and one look for the coach admin: under
 *  /admin the tenant's sheet is off (globals.css tokens show instead) and the
 *  site's light/dark (stored or forced) gives way to the coach's own. The root
 *  layout renders both for a full load; this keeps them right when the coach
 *  moves between her site and the admin in-app, where it does not re-render. */
export function ThemeProvider({
  children,
  forcedTheme,
  adminTheme: initialAdminTheme,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & {
  adminTheme: AdminTheme;
}) {
  const admin = isAdminPath(usePathname());
  const [adminTheme, setAdminTheme] = useState(initialAdminTheme);

  useBeforePaint(() => {
    const sheet = document.getElementById(TENANT_THEME_SHEET_ID);
    if (sheet) (sheet as HTMLStyleElement).media = admin ? "not all" : "";
    if (!admin) return;
    // next-themes applies the class after paint; without this the admin
    // shows one frame in the site's scheme.
    const root = document.documentElement.classList;
    root.remove("light", "dim", "dark");
    root.add(adminTheme);
  }, [admin, adminTheme]);

  const setTheme = (theme: AdminTheme) => {
    setAdminTheme(theme);
    document.cookie = `${ADMIN_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <AdminThemeContext.Provider value={{ theme: adminTheme, setTheme }}>
      <NextThemesProvider
        {...props}
        forcedTheme={admin ? adminTheme : forcedTheme}
      >
        {children}
      </NextThemesProvider>
    </AdminThemeContext.Provider>
  );
}
