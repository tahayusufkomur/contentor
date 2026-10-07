import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/live";
import {
  EmptyHint,
  SmartLink,
  Txt,
  eventHref,
  eventPriceLabel,
  has,
} from "../kit";
import { LocalWhen } from "../local-time";
import type { SectionProps } from "../types";
import { Arrow, BTN_GHOST, H3, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Upcoming meetups as a trail itinerary: client-local timestamps, blaze location pips, and prices. */
export function EventsMeetups({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 border-t-2 border-foreground">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`} className="border-b border-border">
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-6 gap-y-2 py-6 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                >
                  <span className={cn(LABEL, NUM, "text-primary")}>
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <span className="min-w-0">
                    <h3 className={cn(H3, "text-[1.3rem] md:text-[1.5rem]")}>
                      {e.title}
                    </h3>
                    {e.location && (
                      <span className="mt-1 flex items-center gap-2 text-[0.92rem] text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full bg-accent"
                        />
                        <span>{e.location}</span>
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col sm:items-end">
                    <span className={cn(NUM, "font-semibold")}>
                      {eventPriceLabel(e)}
                    </span>
                    <span className="trail-link mt-1 inline-flex items-center gap-2 text-[0.9rem] font-semibold">
                      <span>Join</span>
                      <Arrow />
                    </span>
                  </span>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming sessions"
              text="Schedule a live class or event and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink href="/calendar" className={BTN_GHOST}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "All meetups"
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
