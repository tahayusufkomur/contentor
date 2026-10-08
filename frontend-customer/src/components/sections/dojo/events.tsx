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
import { Arrow, H3, LABEL, Opener, Section, WRAP } from "./ui";

/** Dojo timetable: scheduled training sessions and gradings in a ruled table. */
export function EventsTimetable({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={
        typeof block.heading === "string" ? block.heading : "Timetable & Events"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 border-t-2 border-primary">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-6 gap-y-3 border-b border-border py-6 transition-colors hover:bg-muted/20 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:px-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="size-1.5 rounded-full bg-accent" />
                    <span className="dojo-tnum text-[0.88rem] font-bold uppercase tracking-wider text-accent">
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.25rem] leading-tight text-foreground transition-colors group-hover:text-accent md:text-[1.4rem]",
                      )}
                    >
                      {e.title}
                    </h3>
                    <p className="mt-1 text-[0.9rem] text-muted-foreground">
                      {e.location ||
                        (e.type === "onsite_event"
                          ? "Dojo Tatami · In Person"
                          : "Online Live Stream")}
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end sm:text-right">
                    <span className={cn(LABEL, "text-foreground font-bold")}>
                      {eventPriceLabel(e)}
                    </span>
                    <span className="dojo-link mt-1.5 inline-flex items-center gap-2 text-[0.88rem] font-bold text-accent">
                      <span>Reserve Spot</span>
                      <Arrow />
                    </span>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming sessions scheduled"
              text="Schedule a live training session or grading and it appears in the timetable."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink
              href="/calendar"
              className="group dojo-link inline-flex items-center gap-2 font-bold text-[0.95rem]"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "Full training calendar"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
