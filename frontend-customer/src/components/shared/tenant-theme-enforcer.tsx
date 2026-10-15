"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

// Dark mode off for visitors is enforced by ThemeProvider's forcedTheme, not
// here: writing "light" into the shared choice would undo the coach's own dark.
export function TenantThemeEnforcer() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    // Every site wears a look (siteLook), and looks are light or dark: a
    // stored "dim" is the dark scheme. The layout's `value` map already paints
    // it as .dark; this rewrites the stored choice.
    if (resolvedTheme === "dim") setTheme("dark");
  }, [resolvedTheme, setTheme]);

  return null;
}
