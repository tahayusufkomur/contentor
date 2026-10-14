"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Sunset, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
  compact?: boolean;
  className?: string;
  /**
   * Ordered list of themes to step through. Two entries → the classic
   * sun/moon toggle. Three or more → a cycle button that advances through
   * each theme in order (light → dim → dark → light …). Defaults to the
   * two-mode toggle so existing callers are unaffected.
   */
  modes?: string[];
}

const MODE_META: Record<string, { icon: LucideIcon; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dim: { icon: Sunset, label: "Dim" },
  dark: { icon: Moon, label: "Dark" },
};

export function ThemeToggle({
  collapsed = false,
  compact = false,
  className,
  modes = ["light", "dark"],
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const iconOnly = compact || collapsed;

  // ── Multi-mode: cycle through the given themes in order ──────────────
  if (modes.length > 2) {
    const current = mounted && resolvedTheme ? resolvedTheme : modes[0];
    const currentIndex = modes.indexOf(current);
    const next = modes[(currentIndex + 1) % modes.length] ?? modes[0];
    const meta = MODE_META[current] ?? MODE_META.light;
    const nextMeta = MODE_META[next] ?? MODE_META.light;
    const Icon = meta.icon;

    return (
      <Button
        variant="ghost"
        size={iconOnly ? "icon" : "sm"}
        className={cn(
          "relative",
          iconOnly ? "justify-center" : "w-full justify-start gap-3",
          className,
        )}
        onClick={() => mounted && setTheme(next)}
        aria-label={`Theme: ${meta.label}. Switch to ${nextMeta.label} mode`}
        title={`Theme: ${meta.label} — click for ${nextMeta.label}`}
      >
        <Icon className="h-4 w-4 transition-all" />
        {!iconOnly && <span className="text-sm">{meta.label} mode</span>}
      </Button>
    );
  }

  // ── Classic two-mode sun/moon toggle ────────────────────────────────
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "relative",
        iconOnly ? "justify-center" : "w-full justify-start gap-3",
        className,
      )}
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="relative h-4 w-4">
        <Sun className="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      {!iconOnly && <span className="text-sm">Dark mode</span>}
    </Button>
  );
}
