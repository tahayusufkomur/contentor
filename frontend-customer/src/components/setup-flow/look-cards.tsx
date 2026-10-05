"use client";

import { useState } from "react";
import { Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { LookCards, LookOption } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

/** Style and logo choices, tapped right inside the conversation. */
export function LookCardsView({
  cards,
  disabled,
  onPick,
  onMore,
}: {
  cards: LookCards;
  disabled: boolean;
  onPick: (value: string, label: string) => void;
  onMore: (page: number) => Promise<LookCards>;
}) {
  const [shown, setShown] = useState<LookCards>(cards);
  const { run: more, loading } = useAsyncAction(
    async () => setShown(await onMore((shown.page ?? 0) + 1)),
    { errorToast: "Couldn’t load more logos. Try again." },
  );

  if (shown.kind === "style") {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {shown.options.map((o) => (
          <CardButton
            key={o.value}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
          >
            <span className="block text-[14px] font-semibold">{o.label}</span>
            {o.detail && (
              <span className="mt-1 block text-[12.5px] leading-snug text-[var(--sf-graphite)]">
                {o.detail}
              </span>
            )}
          </CardButton>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {shown.options.map((o: LookOption) => (
          <CardButton
            key={o.value}
            disabled={disabled}
            onClick={() => onPick(o.value, o.label)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={o.image_url}
              alt={o.label}
              className="mx-auto aspect-square w-full rounded-lg object-contain"
            />
            <span className="mt-1.5 block truncate text-center text-[12px]">
              {o.label}
            </span>
          </CardButton>
        ))}
        <CardButton
          disabled={disabled}
          onClick={() => onPick("wordmark", "Just my name, as text")}
        >
          <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--sf-tint)]">
            <Type className="size-6 text-[var(--sf-graphite)]" aria-hidden />
          </span>
          <span className="mt-1.5 block text-center text-[12px]">
            Just my name
          </span>
        </CardButton>
      </div>
      {shown.more && (
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          disabled={disabled}
          onClick={() => more()}
          className="mt-2 rounded-full"
        >
          Show me others
        </Button>
      )}
    </div>
  );
}

function CardButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-[var(--sf-line)] bg-white p-3 text-left transition-colors",
        "hover:border-[var(--sf-line-strong)] hover:bg-[var(--sf-tint)] disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}
