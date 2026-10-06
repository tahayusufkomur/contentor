"use client";

import { useState } from "react";
import { Check, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { LookCards, LookOption } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

const WORDMARK = "Just my name, as text";

/** Style and logo choices as big cards. ``selected`` is the label the coach
 * picked before (a question they went back to). */
export function LookCardsView({
  cards,
  selected,
  disabled,
  onPick,
  onMore,
}: {
  cards: LookCards;
  selected?: string;
  disabled: boolean;
  onPick: (value: string, label: string) => void;
  onMore: (page: number) => Promise<LookCards>;
}) {
  const [shown, setShown] = useState<LookCards>(cards);
  const { run: more, loading } = useAsyncAction(
    async () => setShown(await onMore((shown.page ?? 0) + 1)),
    { errorToast: "Couldn’t load more logos. Try again." },
  );
  const isPicked = (label: string) =>
    !!selected && selected.trim().toLowerCase() === label.toLowerCase();

  if (shown.kind === "style") {
    return (
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.options.map((o) => (
          <CardButton
            key={o.value}
            picked={isPicked(o.label)}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
            className="min-h-[148px] p-5"
          >
            {o.recommended && (
              <span className="mb-3 inline-block rounded-full bg-[var(--sf-brass-soft)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--sf-brass)]">
                Recommended for you
              </span>
            )}
            <span className="block text-[18px] font-semibold tracking-[-0.01em]">
              {o.label}
            </span>
            {o.detail && (
              <span className="mt-1.5 block text-[14px] leading-snug text-[var(--sf-graphite)]">
                {o.detail}
              </span>
            )}
          </CardButton>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.options.map((o: LookOption) => (
          <CardButton
            key={o.value}
            picked={isPicked(o.label)}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
            className="p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={o.image_url}
              alt={o.label}
              className="mx-auto aspect-square w-full rounded-lg object-contain"
            />
            <span className="mt-2 block truncate text-center text-[13px]">
              {o.label}
            </span>
          </CardButton>
        ))}
        <CardButton
          picked={isPicked(WORDMARK)}
          disabled={disabled}
          onClick={() => onPick("wordmark", WORDMARK)}
          className="p-3"
        >
          <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--sf-tint)]">
            <Type className="size-8 text-[var(--sf-graphite)]" aria-hidden />
          </span>
          <span className="mt-2 block text-center text-[13px]">
            Just my name
          </span>
        </CardButton>
      </div>
      {shown.more && (
        <Button
          variant="ghost"
          size="lg"
          loading={loading}
          disabled={disabled}
          onClick={() => more()}
          className="mt-3 rounded-full"
        >
          Show me others
        </Button>
      )}
    </div>
  );
}

function CardButton({
  picked,
  disabled,
  onClick,
  className,
  children,
}: {
  picked: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border bg-white text-left transition-[border-color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-0.5 disabled:opacity-50",
        picked
          ? "border-[var(--sf-ink)] shadow-[0_0_0_1px_var(--sf-ink)]"
          : "border-[var(--sf-line)] hover:border-[var(--sf-line-strong)] hover:shadow-[0_10px_24px_-16px_rgb(48_36_20/0.45)]",
        className,
      )}
    >
      {children}
      {picked && (
        <span
          aria-hidden
          className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)]"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
