"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** The blank tile at the end of a several-pick question. What is typed here
 * becomes a tile of its own, picked; Enter or leaving the card does it, and
 * the card stays blank for the next one. A comma makes several at once, unless
 * the tiles are sentences (``sentence``): then the whole text is one. */
export function OwnOptionCard({
  disabled,
  delay,
  sentence = false,
  placeholder = "Add your own…",
  onAdd,
}: {
  disabled: boolean;
  delay: number;
  sentence?: boolean;
  placeholder?: string;
  onAdd: (labels: string[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const labels = (sentence ? [text] : text.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    setText("");
    if (labels.length) onAdd(labels);
  };
  return (
    <label
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "flex min-h-[84px] cursor-text items-center gap-2.5 rounded-2xl border border-dashed border-[var(--sf-line-strong)] bg-white/60 px-4 py-3.5 text-[15.5px] transition-[border-color,background-color] duration-200 focus-within:border-solid focus-within:border-[var(--sf-ink)] focus-within:bg-white motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]",
        disabled && "pointer-events-none opacity-55",
      )}
    >
      <Plus aria-hidden className="size-5 shrink-0 text-[var(--sf-brass)]" />
      <input
        value={text}
        maxLength={sentence ? 200 : 60}
        disabled={disabled}
        aria-label="Add your own option"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          add();
        }}
        onBlur={add}
        className="min-w-0 flex-1 bg-transparent font-medium text-[var(--sf-ink)] outline-none placeholder:font-normal placeholder:text-[var(--sf-faint)]"
      />
    </label>
  );
}
