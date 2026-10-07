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
import { Arrow, BTN, H3, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Events tour dates: upcoming dates laid out like a tour poster lineup with date, title, venue and ticket links. */
export function EventsTourDates({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-12 border-t-[3px] border-foreground">
            <li
              aria-hidden="true"
              className={cn(
                LABEL,
                "hidden grid-cols-[10rem_minmax(0,1fr)_9rem_6rem] items-center gap-x-6 border-b border-foreground py-3 text-muted-foreground sm:grid",
              )}
            >
              <span>Date</span>
              <span>Show</span>
              <span>Venue</span>
              <span />
            </li>
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid grid-cols-1 items-center gap-y-2 border-b border-foreground py-5 sm:grid-cols-[10rem_minmax(0,1fr)_9rem_6rem] sm:gap-x-6 sm:gap-y-0"
                >
                  <span className={cn(LABEL, NUM, "text-muted-foreground")}>
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <h3
                    className={cn(
                      H3,
                      "min-w-0 text-[1.2rem] uppercase md:text-[1.45rem]",
                    )}
                  >
                    {e.title}
                  </h3>
                  <span className="text-[0.92rem] text-muted-foreground">
                    {e.location || "Online"}
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-center sm:text-right">
                    <span className={cn(LABEL, NUM, "text-muted-foreground")}>
                      {eventPriceLabel(e)}
                    </span>
                    <span className="encore-link inline-flex items-center gap-2 text-[0.9rem] font-semibold sm:mt-1">
                      Tickets
                      <Arrow />
                    </span>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No upcoming sessions"
              text="Schedule a live class or event and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink href="/calendar" className={BTN}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "All dates"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
