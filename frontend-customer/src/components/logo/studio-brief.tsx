"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STYLE_CHIPS, type Brief } from "@/lib/logo/composer";

interface StudioBriefProps {
  brief: Brief;
  onChange: (brief: Brief) => void;
  onSubmit: () => void;
  onStartOver: () => void;
}

/** Step 1 · Brief — the coach describes their brand; everything is optional
 * except the name. Chips cap at 3 so the composer pools stay opinionated. */
export function StudioBrief({
  brief,
  onChange,
  onSubmit,
  onStartOver,
}: StudioBriefProps) {
  const toggleChip = (chip: (typeof STYLE_CHIPS)[number]) => {
    const has = brief.styleChips.includes(chip);
    if (!has && brief.styleChips.length >= 3) return;
    onChange({
      ...brief,
      styleChips: has
        ? brief.styleChips.filter((c) => c !== chip)
        : [...brief.styleChips, chip],
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-8">
      <div>
        <h3 className="text-xl font-semibold">Tell us about your brand</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll turn this into a wall of logo ideas you can pick from and
          fine-tune.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Brand name</span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brief.brandName}
          maxLength={80}
          onChange={(e) => onChange({ ...brief, brandName: e.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">What do you teach?</span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brief.niche}
          maxLength={120}
          placeholder="e.g. yoga, fitness, music, cooking…"
          onChange={(e) => onChange({ ...brief, niche: e.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Tagline{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brief.tagline ?? ""}
          maxLength={120}
          placeholder="e.g. Yoga for busy mothers"
          onChange={(e) => onChange({ ...brief, tagline: e.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Describe your vibe{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <input
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={brief.vibe ?? ""}
          maxLength={200}
          placeholder="e.g. calm, earthy, premium but approachable"
          onChange={(e) => onChange({ ...brief, vibe: e.target.value })}
        />
      </label>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          Style{" "}
          <span className="font-normal text-muted-foreground">
            (pick up to 3)
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_CHIPS.map((chip) => {
            const active = brief.styleChips.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={active}
                onClick={() => toggleChip(chip)}
                className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="gap-2"
        disabled={!brief.brandName.trim()}
        onClick={onSubmit}
      >
        <Sparkles className="h-4 w-4" />
        Show my logo ideas
      </Button>

      <button
        type="button"
        onClick={onStartOver}
        className="self-center text-xs text-muted-foreground hover:underline"
      >
        Start over
      </button>
    </div>
  );
}
