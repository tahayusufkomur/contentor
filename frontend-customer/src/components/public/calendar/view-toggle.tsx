"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type CalendarView = "month" | "agenda";

const VIEWS = [
  { value: "month", labelKey: "calendar.month" },
  { value: "agenda", labelKey: "calendar.agenda" },
] as const satisfies readonly { value: CalendarView; labelKey: string }[];

interface ViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  const t = useTranslations("site");
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {VIEWS.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
            view === v.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(v.labelKey)}
        </button>
      ))}
    </div>
  );
}
