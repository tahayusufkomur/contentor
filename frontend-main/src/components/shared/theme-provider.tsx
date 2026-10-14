"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Marketing and the coach dashboard render light always (spec D4); only the
 * superadmin console keeps a light/dark choice, so a stored "dark" never leaks
 * onto the landing. */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname() ?? "";
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <NextThemesProvider {...props} forcedTheme={admin ? undefined : "light"}>
      {children}
    </NextThemesProvider>
  );
}
