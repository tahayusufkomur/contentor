"use client";

import { useEffect, useRef, useState } from "react";
import { clearReaction, setReaction, type TargetKind } from "@/lib/community";
import { REACTION_EMOJIS } from "@/types/community";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 450;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Clear any pending long-press timer on unmount to avoid a leaked timeout
  // calling setState after the component is gone.
  useEffect(() => clearLongPressTimer, []);

  // Close the picker when the user taps/clicks outside it — mouseleave
  // doesn't fire on touch devices, so a long-press-opened picker would
  // otherwise stay open indefinitely.
  useEffect(() => {
    if (!pickerOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("click", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("click", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [pickerOpen]);

  const handleTouchStart = () => {
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    clearLongPressTimer();
    if (longPressFiredRef.current) {
      // The long press already opened the picker — suppress the
      // synthesized click so it doesn't also fire the default toggle.
      e.preventDefault();
    }
  };

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
    <div className="relative" ref={containerRef}>
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={clearLongPressTimer}
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
