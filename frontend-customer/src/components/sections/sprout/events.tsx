import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/live";
import {
  EmptyHint,
  SmartLink,
  Txt,
  eventHref,
  eventPriceLabel,
  formatEventTime,
  has,
} from "../kit";
import { LocalWhen } from "../local-time";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  H3,
  Opener,
  PILL,
  Section,
  WRAP,
  getSproutTint,
} from "./ui";

function DateLeaf({ iso }: { iso: string }) {
  const d = new Date(iso);
  const isValid = !Number.isNaN(d.getTime());
  const month = isValid
    ? d.toLocaleDateString(undefined, { month: "short" })
    : "";
  const day = isValid ? d.getDate() : "";

  return (
    <div className="flex size-16 shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-[color-mix(in_oklch,var(--border)_80%,transparent)] bg-background text-center shadow-sm sm:size-20">
      <span className="w-full bg-accent px-1 py-0.5 font-display text-[0.72rem] font-bold uppercase tracking-wider text-accent-foreground sm:text-[0.78rem]">
        {month || "Event"}
      </span>
      <span className="font-display text-[1.4rem] font-bold leading-none text-foreground sm:text-[1.75rem]">
        {day || "•"}
      </span>
    </div>
  );
}

/** Upcoming playdates, workshops, and family sessions with calendar-leaf date bubbles. */
export function EventsPlaydates({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="paper"
      label={
        typeof block.heading === "string" ? block.heading : "Playdates & Events"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="left" />

        {events.length ? (
          <div className="mt-12 space-y-5">
            {events.map((e, i) => (
              <SmartLink
                key={`${e.type}-${e.id}`}
                href={eventHref(e)}
                className={cn(
                  "group grid items-center gap-6 rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] p-5 transition-all duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-7",
                  getSproutTint(i),
                )}
              >
                {/* Date Leaf Bubble */}
                <div className="flex items-center gap-4">
                  <DateLeaf iso={e.scheduled_at} />
                </div>

                {/* Event Details */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        PILL,
                        "bg-background/80 text-foreground shadow-xs",
                      )}
                    >
                      {e.type === "onsite_event"
                        ? e.location || "In person"
                        : "Online, live"}
                    </span>
                    <span className="text-[0.85rem] font-semibold text-muted-foreground">
                      <LocalWhen iso={e.scheduled_at} />
                      {formatEventTime(e.scheduled_at) &&
                        ` · ${formatEventTime(e.scheduled_at)}`}
                    </span>
                  </div>

                  <h3
                    className={cn(
                      H3,
                      "mt-2 text-[1.25rem] font-bold leading-snug text-foreground transition-colors group-hover:text-primary md:text-[1.4rem]",
                    )}
                  >
                    {e.title}
                  </h3>

                  {e.description && (
                    <p className="mt-1 line-clamp-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                </div>

                {/* Price & Booking action */}
                <div className="flex items-center justify-between gap-4 border-t border-[color-mix(in_oklch,var(--border)_60%,transparent)] pt-4 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                  <span className="font-display text-[1.15rem] font-bold text-primary">
                    {eventPriceLabel(e)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-display text-[0.92rem] font-bold text-foreground transition-colors group-hover:text-primary">
                    <span>Save your spot</span>
                    <Arrow className="size-3.5" />
                  </span>
                </div>
              </SmartLink>
            ))}
          </div>
        ) : (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No upcoming playdates or sessions"
              text="Schedule an in-person or online session and it will appear here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex justify-start">
            <SmartLink href="/calendar" className={BTN}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "See full calendar"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
