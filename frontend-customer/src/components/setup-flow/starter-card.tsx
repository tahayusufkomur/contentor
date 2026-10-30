"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { starterStart } from "@/lib/interview";
import { cn } from "@/lib/utils";

/** A sentence starter ("I found yoga when…") as a tile. Picking it selects
 * the card and opens the sentence inside it, so the coach finishes it right
 * there (never in the answer box). The check takes it back out. A picked
 * card whose sentence is not finished says so on the card itself. */
export function StarterCard({
  starter,
  text,
  selected,
  finished,
  disabled,
  delay,
  onToggle,
  onEdit,
}: {
  /** The starter as offered ("I found yoga when…"). */
  starter: string;
  /** The sentence as the coach has it so far. */
  text: string;
  selected: boolean;
  /** The coach has finished the sentence (not just left the starter as is). */
  finished: boolean;
  disabled: boolean;
  delay: number;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const t = useTranslations("admin.setupFlow");
  const style = { animationDelay: `${delay}ms` };
  if (!selected)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        style={style}
        className={cn(
          "flex min-h-[84px] items-center rounded-2xl border border-[var(--sf-line)] bg-white px-4 py-3.5 text-left text-[15.5px] font-medium leading-snug hover:border-[var(--sf-line-strong)] hover:shadow-[0_10px_24px_-16px_rgb(48_36_20/0.45)]",
          "transition-[background-color,border-color,box-shadow,transform] duration-200 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] disabled:pointer-events-none",
          disabled && "opacity-55",
        )}
      >
        {starter}
      </button>
    );
  return (
    <div
      style={style}
      className="flex min-h-[84px] flex-col gap-2 rounded-2xl border border-[var(--sf-ink)] bg-[var(--sf-ink)] px-4 py-3.5 text-[15.5px] font-medium leading-snug text-[var(--sf-paper)] shadow-[0_10px_24px_-14px_rgb(34_33_31/0.6)] motion-safe:animate-[sf-pop_.5s_var(--sf-spring)_both]"
    >
      <div className="flex items-start gap-2">
        <OpenStarter
          starter={starter}
          text={text}
          disabled={disabled}
          onEdit={onEdit}
        />
        <button
          type="button"
          aria-label={t("starter.takeOut")}
          disabled={disabled}
          onClick={onToggle}
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--sf-paper)] bg-[var(--sf-paper)] text-[var(--sf-ink)]"
        >
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </button>
      </div>
      {!finished && (
        <p className="flex items-center gap-1.5 text-[13px] font-normal text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {t("starter.finishOrRemove")}
        </p>
      )}
    </div>
  );
}

/** The open sentence: focused on opening, caret at the end, Enter is done. */
function OpenStarter({
  starter,
  text,
  disabled,
  onEdit,
}: {
  starter: string;
  text: string;
  disabled: boolean;
  onEdit: (text: string) => void;
}) {
  const t = useTranslations("admin.setupFlow");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={box}
      rows={2}
      value={text}
      disabled={disabled}
      maxLength={200}
      aria-label={t("starter.finishLabel", { start: starterStart(starter) })}
      placeholder={t("starter.finishPlaceholder")}
      onChange={(e) => onEdit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        e.preventDefault();
        e.currentTarget.blur();
      }}
      className="min-w-0 flex-1 resize-none bg-transparent leading-snug text-[var(--sf-paper)] outline-none [field-sizing:content] placeholder:font-normal placeholder:text-[rgb(255_255_255/0.6)]"
    />
  );
}
