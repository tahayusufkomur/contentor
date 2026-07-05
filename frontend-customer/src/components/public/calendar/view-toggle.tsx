"use client";

import { cn } from "@/lib/utils";

type CalendarView = "month" | "agenda";

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
];

interface ViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
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
          {v.label}
        </button>
      ))}
    </div>
  );
}
