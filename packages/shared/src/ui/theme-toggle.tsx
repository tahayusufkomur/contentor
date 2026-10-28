"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Sunset, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
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

// The words are `common.ui.theme.<mode>` (name) and `.<mode>Mode` (as a label).
const MODE_META: Record<string, { icon: LucideIcon }> = {
  light: { icon: Sun },
  dim: { icon: Sunset },
  dark: { icon: Moon },
};
const MODES = ["light", "dim", "dark"] as const;
type Mode = (typeof MODES)[number];
const asMode = (m: string): Mode =>
  (MODES as readonly string[]).includes(m) ? (m as Mode) : "light";

export function ThemeToggle({
  collapsed = false,
  compact = false,
  className,
  modes = ["light", "dark"],
}: ThemeToggleProps) {
  const t = useTranslations("common");
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
    const Icon = (MODE_META[current] ?? MODE_META.light).icon;
    const name = t(`ui.theme.${asMode(current)}`);
    const nextName = t(`ui.theme.${asMode(next)}`);
    const nextMode = t(`ui.theme.${asMode(next)}Mode`);

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
        aria-label={t("ui.theme.cycleAria", { current: name, next: nextMode })}
        title={t("ui.theme.cycleTitle", { current: name, next: nextName })}
      >
        <Icon className="h-4 w-4 transition-all" />
        {!iconOnly && (
          <span className="text-sm">
            {t(`ui.theme.${asMode(current)}Mode`)}
          </span>
        )}
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
      aria-label={
        isDark ? t("ui.theme.switchToLight") : t("ui.theme.switchToDark")
      }
    >
      <span className="relative h-4 w-4">
        <Sun className="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      {!iconOnly && <span className="text-sm">{t("ui.theme.darkMode")}</span>}
    </Button>
  );
}
