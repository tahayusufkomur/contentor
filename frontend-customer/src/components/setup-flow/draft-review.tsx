"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, Check, ImageOff, MapPin, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { formatPrice } from "@/lib/interview";
import type { ReviewCard, ReviewItem, ReviewKind } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

const NOUN: Record<ReviewKind, string> = { course: "course", event: "class" };
const DRAFTING: Record<ReviewKind, string[]> = {
  course: ["Outlining the modules", "Writing the lessons", "Choosing a cover"],
  event: ["Planning the session", "Finding a good time", "Choosing a cover"],
};

/** The interview's first course or class, shown as it was drafted: cover
 * (with a few others to choose from), title, description, price, and the
 * curriculum or the date. While it drafts, a page-shaped skeleton and the
 * steps it is going through. ``delay`` (ms) is when it springs in. */
export function DraftReview({
  card,
  delay,
  disabled,
  onCover,
}: {
  card: ReviewCard;
  delay: number;
  disabled: boolean;
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
}) {
  const enter = (i: number): CSSProperties => ({
    animationDelay: `${delay + i * 90}ms`,
  });
  if (card.status === "waiting")
    return (
      <p
        style={enter(0)}
        className="mt-8 max-w-[60ch] rounded-2xl border border-[var(--sf-line)] bg-white px-5 py-4 text-[15px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
      >
        Live classes come with a paid plan. When you go live I’ll offer you one,
        and your first class will be drafted the moment it’s active.
      </p>
    );
  if (card.status === "building" || !card.item) {
    return card.status === "failed" ? (
      <p
        style={enter(0)}
        className="mt-8 max-w-[60ch] rounded-2xl border border-[var(--sf-line)] bg-white px-5 py-4 text-[15px] text-[var(--sf-graphite)] motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
      >
        I couldn’t draft your {NOUN[card.kind]} this time. Tell me what it
        should be about below and I’ll try again, or skip it for now.
      </p>
    ) : (
      <Drafting kind={card.kind} style={enter(0)} />
    );
  }
  return (
    <Drafted
      kind={card.kind}
      item={card.item}
      enter={enter}
      disabled={disabled}
      onCover={onCover}
    />
  );
}

function Drafting({ kind, style }: { kind: ReviewKind; style: CSSProperties }) {
  return (
    <div
      role="status"
      style={style}
      className="mt-8 grid gap-6 rounded-3xl border border-[var(--sf-line)] bg-white p-4 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both] sm:p-6 lg:grid-cols-[1.1fr_1fr]"
    >
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-[15px] font-medium">
          <Spinner size="sm" className="text-[var(--sf-brass)]" />
          Drafting your first {NOUN[kind]}…
        </p>
        <ol className="space-y-2.5">
          {DRAFTING[kind].map((label, i) => (
            <li
              key={label}
              style={{ animationDelay: `${i * 0.6}s` }}
              className="flex items-center gap-2.5 text-[14px] text-[var(--sf-graphite)] motion-safe:animate-[sf-glow_1.8s_ease-in-out_infinite]"
            >
              <span className="size-1.5 rounded-full bg-[var(--sf-brass)]" />
              {label}
            </li>
          ))}
        </ol>
        <Skeleton className="mt-2 h-7 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <p className="mt-auto text-[13px] text-[var(--sf-faint)]">
          Usually ready in under a minute.
        </p>
      </div>
    </div>
  );
}

function Drafted({
  kind,
  item,
  enter,
  disabled,
  onCover,
}: {
  kind: ReviewKind;
  item: ReviewItem;
  enter: (i: number) => CSSProperties;
  disabled: boolean;
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const { run: pick } = useAsyncAction(
    async (asset: string) => {
      setPicking(asset);
      try {
        await onCover(kind, asset);
      } finally {
        setPicking(null);
      }
    },
    { errorToast: "Couldn’t use that cover. Try another." },
  );
  const price = item.price
    ? formatPrice(
        Math.round(parseFloat(item.price) * 100),
        item.currency,
      ).replace(/[.,]00$/, "")
    : "Free";
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div
        style={enter(0)}
        className="motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
      >
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[var(--sf-tint)] shadow-[0_24px_48px_-28px_rgb(48_36_20/0.55)]">
          {item.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.cover_url}
              src={item.cover_url}
              alt=""
              className="size-full object-cover motion-safe:animate-fade-in"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-[var(--sf-faint)]">
              <ImageOff className="size-8" aria-hidden />
            </span>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-[rgb(20_18_16/0.72)] px-3 py-1 text-[13px] font-semibold text-white backdrop-blur">
            {price}
          </span>
        </div>
        {item.covers.length > 1 && (
          <div className="mt-3">
            <p className="text-[12.5px] text-[var(--sf-graphite)]">
              Pick a cover
            </p>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {item.covers.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={c.current}
                  aria-label={c.current ? "Current cover" : "Use this cover"}
                  disabled={disabled || c.current || picking !== null}
                  onClick={() => pick(c.value)}
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-lg ring-offset-2 ring-offset-[var(--sf-paper)] transition-[box-shadow,transform] motion-safe:hover:-translate-y-0.5",
                    c.current
                      ? "ring-2 ring-[var(--sf-ink)]"
                      : "ring-1 ring-[var(--sf-line)] hover:ring-[var(--sf-line-strong)]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" className="size-full object-cover" />
                  {(c.current || picking === c.value) && (
                    <span className="absolute inset-0 flex items-center justify-center bg-[rgb(20_18_16/0.35)] text-white">
                      {picking === c.value ? (
                        <Spinner size="sm" />
                      ) : (
                        <Check className="size-4" strokeWidth={3} />
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p
          style={enter(1)}
          className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--sf-brass)] motion-safe:animate-[sf-rise_.5s_ease-out_both]"
        >
          Your first {NOUN[kind]}
        </p>
        <h2
          style={enter(2)}
          className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] motion-safe:animate-[sf-word_.8s_var(--sf-spring)_both] sm:text-[30px]"
        >
          {item.title}
        </h2>
        {kind === "event" && item.when && (
          <div
            style={enter(3)}
            className="mt-3 flex flex-wrap gap-2 text-[13.5px] motion-safe:animate-[sf-rise_.5s_ease-out_both]"
          >
            <Chip>
              <CalendarDays className="size-4" aria-hidden />
              {new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(item.when))}
            </Chip>
            <Chip>
              {item.event_kind === "onsite" ? (
                <MapPin className="size-4" aria-hidden />
              ) : (
                <Video className="size-4" aria-hidden />
              )}
              {item.event_kind === "onsite"
                ? item.location || "In person"
                : "Online, live"}
            </Chip>
          </div>
        )}
        <p
          style={enter(3)}
          className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_both]"
        >
          {item.description}
        </p>
        {!!item.modules?.length && (
          <ol className="mt-5 space-y-2">
            {item.modules.map((m, i) => (
              <li
                key={`${i}:${m.title}`}
                style={enter(4 + i)}
                className="rounded-xl border border-[var(--sf-line)] bg-white px-4 py-3 motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
              >
                <p className="flex items-baseline gap-2.5 text-[15px] font-medium">
                  <span className="text-[12px] tabular-nums text-[var(--sf-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {m.title}
                </p>
                {m.lessons.length > 0 && (
                  <p className="mt-1 pl-7 text-[13px] leading-snug text-[var(--sf-graphite)]">
                    {m.lessons.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sf-line)] bg-white px-3 py-1">
      {children}
    </span>
  );
}
