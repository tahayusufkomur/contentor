"use client";

import { useState } from "react";
import { CalendarDays, Check, ImageOff, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { formatPrice } from "@/lib/interview";
import type {
  BuilderKind,
  ReviewCard,
  ReviewItem,
  ReviewKind,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

/** What the preview is built from: every answer so far (the live question's
 * unsent pick included), the drafted item once there is one, and a photo of
 * what the coach teaches to stand in for a cover. */
export interface BuilderData {
  answers: Record<string, string>;
  review: ReviewCard | null;
  /** Covers to choose from, offered before the draft is reviewed. */
  covers: ReviewItem["covers"];
  photo?: string;
}

const PERKS: Record<string, string> = {
  "Digital Courses": "Every digital course, included",
  "Live online classes": "All live online classes",
  "In-person sessions": "Member rates on in-person sessions",
  Articles: "Members-only articles",
  Community: "The members' community",
};
const DEFAULT_PERKS = [
  "Every digital course, included",
  "All live online classes",
  "The members' community",
];

/** The thing a question is building, drawn live beside it: the first
 * course, the membership or the first class, with each answer landing in
 * it as it is picked. */
export function BuilderPreview({
  kind,
  data,
  brandName,
  disabled,
  onCover,
}: {
  kind: BuilderKind;
  data: BuilderData;
  brandName: string;
  disabled: boolean;
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
}) {
  if (kind === "membership")
    return <MembershipCard data={data} brandName={brandName} />;
  return (
    <ItemCard kind={kind} data={data} disabled={disabled} onCover={onCover} />
  );
}

function Card({
  kicker,
  children,
}: {
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[var(--sf-line)] bg-white p-4 shadow-[0_24px_48px_-28px_rgb(48_36_20/0.45)] sm:p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--sf-brass)]">
        {kicker}
      </p>
      {children}
    </div>
  );
}

function ItemCard({
  kind,
  data,
  disabled,
  onCover,
}: {
  kind: ReviewKind;
  data: BuilderData;
  disabled: boolean;
  onCover: (kind: ReviewKind, asset: string) => Promise<unknown>;
}) {
  const item = data.review?.status === "ready" ? data.review.item : null;
  const a = data.answers;
  const topic = a[kind === "course" ? "course_topic" : "live_topic"];
  const priceText = a[kind === "course" ? "course_price" : "event_price"];
  const title = item?.title ?? topic;
  const covers = item?.covers ?? data.covers;
  const cover =
    item?.cover_url || covers.find((c) => c.current)?.url || data.photo;
  const price = priceText
    ? /free/i.test(priceText)
      ? "Free"
      : priceText
    : item?.price
      ? formatPrice(Math.round(parseFloat(item.price) * 100), item.currency)
      : null;
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
  return (
    <Card kicker={kind === "course" ? "Your first course" : "Your first class"}>
      <div className="relative mt-3 aspect-video overflow-hidden rounded-2xl bg-[var(--sf-tint)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cover}
            src={cover}
            alt=""
            className="size-full object-cover motion-safe:animate-fade-in"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-[var(--sf-faint)]">
            <ImageOff className="size-8" aria-hidden />
          </span>
        )}
        {price && (
          <span
            key={price}
            className="absolute left-3 top-3 rounded-full bg-[rgb(20_18_16/0.72)] px-3 py-1 text-[13px] font-semibold text-white backdrop-blur motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
          >
            {price}
          </span>
        )}
      </div>
      {covers.length > 1 && (
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {covers.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={c.current}
              aria-label={c.current ? "Current cover" : "Use this cover"}
              disabled={disabled || c.current || picking !== null}
              onClick={() => pick(c.value)}
              className={cn(
                "relative aspect-video overflow-hidden rounded-md transition-[box-shadow,transform] motion-safe:hover:-translate-y-0.5",
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
                    <Check className="size-3.5" strokeWidth={3} />
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {title ? (
        <h3
          key={title}
          className="mt-4 text-[20px] font-semibold leading-tight tracking-[-0.02em] motion-safe:animate-[sf-rise_.5s_ease-out_both]"
        >
          {title}
        </h3>
      ) : (
        <Skeleton className="mt-4 h-6 w-4/5" />
      )}
      {kind === "event" && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12.5px]">
          <Chip>
            <CalendarDays className="size-3.5" aria-hidden />
            {item?.when
              ? new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(item.when))
              : (a.live_when ?? (
                  <span className="text-[var(--sf-faint)]">Pick a time</span>
                ))}
          </Chip>
          <Chip>
            <Video className="size-3.5" aria-hidden />
            Online, live
          </Chip>
        </div>
      )}
      {item?.description ? (
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--sf-graphite)]">
          {item.description}
        </p>
      ) : (
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--sf-faint)]">
          {topic
            ? "A short description is drafted from your answers."
            : "Pick a topic and it starts taking shape here."}
        </p>
      )}
      {kind === "course" &&
        (item?.modules?.length ? (
          <ol className="mt-4 space-y-1.5">
            {item.modules.slice(0, 4).map((m, i) => (
              <li
                key={`${i}:${m.title}`}
                className="flex items-baseline gap-2 text-[13.5px]"
              >
                <span className="text-[11px] tabular-nums text-[var(--sf-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate">{m.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
    </Card>
  );
}

function MembershipCard({
  data,
  brandName,
}: {
  data: BuilderData;
  brandName: string;
}) {
  const a = data.answers;
  const perks = (a.offers ?? "")
    .split(", ")
    .map((o) => PERKS[o])
    .filter(Boolean);
  const price = a.membership_price;
  return (
    <Card kicker="Your membership">
      <h3 className="mt-3 text-[20px] font-semibold leading-tight tracking-[-0.02em]">
        {brandName} Membership
      </h3>
      {price ? (
        <p
          key={price}
          className="mt-3 text-[30px] font-semibold tracking-[-0.03em] motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
        >
          {price}
        </p>
      ) : (
        <p className="mt-3 text-[18px] text-[var(--sf-faint)]">
          Pick a monthly price
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {(perks.length ? perks : DEFAULT_PERKS).map((p) => (
          <li key={p} className="flex items-start gap-2 text-[14px]">
            <Check
              className="mt-0.5 size-4 shrink-0 text-[var(--sf-brass)]"
              strokeWidth={2.5}
              aria-hidden
            />
            {p}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] text-[var(--sf-faint)]">
        Billed monthly · Cancel any time
      </p>
    </Card>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sf-line)] bg-white px-2.5 py-1">
      {children}
    </span>
  );
}
