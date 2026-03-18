"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useTenant } from "@/hooks/use-tenant";

export function TenantThemeEnforcer() {
  const config = useTenant();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (config?.dark_mode_enabled === false && resolvedTheme === "dark") {
      setTheme("light");
    }
  }, [config?.dark_mode_enabled, resolvedTheme, setTheme]);

  return null;
}
