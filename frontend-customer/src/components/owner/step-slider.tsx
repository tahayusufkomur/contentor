"use client";

import { cn } from "@/lib/utils";

interface StepSliderProps {
  options: { label: string; value: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** Accessible name for the underlying range input. */
  label?: string;
}

/** A labelled snap-slider for ordered, "how much" settings — shade strength,
 *  spacing, columns, heading size. A native range (themed via accent-primary,
 *  so it stays on-brand across every theme) snaps to discrete stops; the labels
 *  beneath are clickable too. Distinct/categorical choices use buttons instead. */
export function StepSlider({ options, value, onChange, label }: StepSliderProps) {
  if (options.length === 0) return null;
  const found = options.findIndex((o) => o.value === value);
  const idx = found < 0 ? 0 : found;
  return (
    <div className="space-y-1.5">
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={idx}
        aria-label={label}
        onChange={(e) => onChange(options[Number(e.target.value)].value)}
        className="w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex justify-between gap-1">
        {options.map((o, i) => (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "text-[10px] leading-none transition-colors",
              i === idx
                ? "font-semibold text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
