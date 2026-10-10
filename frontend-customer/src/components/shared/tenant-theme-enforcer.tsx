"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useTenant } from "@/hooks/use-tenant";

export function TenantThemeEnforcer() {
  const config = useTenant();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (
      config?.dark_mode_enabled === false &&
      (resolvedTheme === "dark" || resolvedTheme === "dim")
    ) {
      setTheme("light");
    }
    // Styles are light or dark: a stored "dim" is the dark scheme.
    if (config?.style && resolvedTheme === "dim") setTheme("dark");
  }, [config?.dark_mode_enabled, config?.style, resolvedTheme, setTheme]);

  return null;
}
