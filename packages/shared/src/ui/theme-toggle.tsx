"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({
  collapsed = false,
  compact = false,
  className,
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const iconOnly = compact || collapsed;
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
