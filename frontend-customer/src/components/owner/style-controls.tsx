"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { StepSlider } from "./step-slider";
import {
  styleControlsFor,
  STYLE_OPTIONS,
  STYLE_DEFAULTS,
  type StyleControl,
} from "@/lib/blocks/style";
import type { Block } from "@/types/tenant";

interface StyleControlsProps {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
}

/** The "Style" section of a block's editor: the small, theme-safe override
 *  controls (background / spacing / alignment) allowed for this block type.
 *  Selecting the default option clears that override. */
export function StyleControls({ block, onChange }: StyleControlsProps) {
  const tr = useTranslations("admin.owner.style");
  const controls = styleControlsFor(block.type);
  if (controls.length === 0) return null;

  const setStyle = (control: StyleControl, value: string) => {
    const next = { ...(block.style ?? {}) };
    if (value === STYLE_DEFAULTS[control]) delete next[control];
    else next[control] = value;
    onChange({ style: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tr("title")}
      </p>
      {controls.map((control) => {
        const current = block.style?.[control] ?? STYLE_DEFAULTS[control];
        return (
          <div key={control} className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {tr(`control.${control}`)}
            </label>
            {control === "spacing" ? (
              <StepSlider
                options={STYLE_OPTIONS[control].map((value) => ({
                  value,
                  label: tr(`option.${control}.${value}` as never),
                }))}
                value={current}
                onChange={(v) => setStyle(control, v)}
                label={tr(`control.${control}`)}
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                {STYLE_OPTIONS[control].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStyle(control, value)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      current === value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                  >
                    {tr(`option.${control}.${value}` as never)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
