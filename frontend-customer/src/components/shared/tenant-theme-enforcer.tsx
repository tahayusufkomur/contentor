"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useTenant } from "@/hooks/use-tenant";

export function TenantThemeEnforcer() {
  const config = useTenant();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    // Styled sites are designed as one mode, like a dark-mode-off theme.
    const singleMode =
      config?.dark_mode_enabled === false || Boolean(config?.style);
    if (singleMode && (resolvedTheme === "dark" || resolvedTheme === "dim")) {
      setTheme("light");
    }
  }, [config?.dark_mode_enabled, config?.style, resolvedTheme, setTheme]);

  return null;
}
