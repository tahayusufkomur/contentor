"use client";

import { useState } from "react";
import { clearReaction, setReaction, type TargetKind } from "@/lib/community";
import { REACTION_EMOJIS } from "@/types/community";
import { cn } from "@/lib/utils";

export function ReactionBar({
  kind,
  id,
  count,
  mine,
}: {
  kind: TargetKind;
  id: number;
  count: number;
  mine: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(mine);
  const [total, setTotal] = useState(count);
  const [pickerOpen, setPickerOpen] = useState(false);

  const react = async (emoji: string) => {
    setPickerOpen(false);
    const had = current;
    if (had === emoji) {
      setCurrent(null);
      setTotal((t) => Math.max(0, t - 1));
      try {
        await clearReaction(kind, id);
      } catch {
        setCurrent(had);
        setTotal((t) => t + 1);
      }
      return;
    }
    setCurrent(emoji);
    if (!had) setTotal((t) => t + 1);
    try {
      await setReaction(kind, id, emoji);
    } catch {
      setCurrent(had);
      if (!had) setTotal((t) => Math.max(0, t - 1));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors",
          current
            ? "border-primary/40 bg-primary/10"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
        onClick={() => void react(current ?? "❤️")}
        onMouseEnter={() => setPickerOpen(true)}
        onMouseLeave={() => setPickerOpen(false)}
        aria-label="React"
      >
        <span>{current ?? "❤️"}</span>
        <span>{total}</span>
      </button>
      {pickerOpen && (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-full border bg-popover p-1 shadow-md"
          onMouseEnter={() => setPickerOpen(true)}
          onMouseLeave={() => setPickerOpen(false)}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-full p-1 text-lg hover:scale-125"
              onClick={() => void react(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
