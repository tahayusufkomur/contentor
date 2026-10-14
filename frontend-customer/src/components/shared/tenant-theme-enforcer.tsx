"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useTenant } from "@/hooks/use-tenant";

// Dark mode off for visitors is enforced by ThemeProvider's forcedTheme, not
// here: writing "light" into the shared choice would undo the coach's own dark.
export function TenantThemeEnforcer() {
  const config = useTenant();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    // Styles are light or dark: a stored "dim" is the dark scheme.
    if (config?.style && resolvedTheme === "dim") setTheme("dark");
  }, [config?.style, resolvedTheme, setTheme]);

  return null;
}
