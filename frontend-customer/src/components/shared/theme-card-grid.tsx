"use client";

import { Check } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

interface ThemeCardGridProps {
  selectedTheme?: string;
  onSelect: (themeId: string) => void;
  className?: string;
}

export function ThemeCardGrid({
  selectedTheme,
  onSelect,
  className,
}: ThemeCardGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {THEMES.map((theme) => {
        const selected = theme.id === selectedTheme;

        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelect(theme.id)}
            aria-pressed={selected}
            className={cn(
              "group rounded-xl border bg-card p-3 text-left transition-all",
              "hover:border-primary/40 hover:shadow-sm",
              selected &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{theme.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {theme.description}
                </p>
              </div>
              {selected && <Check className="mt-0.5 h-4 w-4 text-primary" />}
            </div>

            <div
              className="mt-3 h-5 rounded-lg border border-white/20"
              style={{ background: theme.cinematic.light }}
            />

            <div className="mt-3 flex gap-1.5">
              {theme.preview.map((swatch) => (
                <span
                  key={swatch}
                  className="h-5 flex-1 rounded-md border border-black/5"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
