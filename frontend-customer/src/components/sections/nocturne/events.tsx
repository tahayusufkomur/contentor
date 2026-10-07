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
import { Arrow, BTN_GHOST, CHIP, H3, Opener, Section, WRAP } from "./ui";

/** Upcoming events as evening cards with local time chips and reserve
 *  links. */
export function EventsEvenings({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mx-auto mt-14 max-w-[52rem] space-y-4">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[var(--radius)] border border-border bg-muted p-5 md:p-6"
                >
                  <span className={cn(CHIP, "nocturne-tnum")}>
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <h3
                    className={cn(
                      H3,
                      "min-w-[12rem] flex-1 text-[1.25rem] leading-snug md:text-[1.45rem]",
                    )}
                  >
                    {e.title}
                  </h3>
                  {e.location && (
                    <span className="text-[0.92rem] text-muted-foreground">
                      {e.location}
                    </span>
                  )}
                  <span className="text-[0.95rem] font-semibold text-primary">
                    {eventPriceLabel(e)}
                  </span>
                  <span className="nocturne-link inline-flex items-center gap-2 text-[0.9rem] font-medium">
                    <span>Reserve</span>
                    <Arrow />
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
          <div className="mt-12 flex justify-center">
            <SmartLink href="/calendar" className={BTN_GHOST}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "Full calendar"
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
