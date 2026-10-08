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
import { Arrow, CHIP, H3, Opener, Section, WRAP, str } from "./ui";

/** Upcoming live classes and studio workshops arranged as a timetable
 *  schedule with date blocks, time chips, prices, and reservation links. */
export function EventsSchedule({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} cue="SCHEDULE" />

        {events.length ? (
          <ol className="mt-14 space-y-4">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group studiofloor-card studiofloor-row-hover grid items-center gap-y-4 rounded-[var(--radius)] p-5 transition-all md:grid-cols-[14rem_minmax(0,1fr)_auto] md:gap-x-8 md:p-6"
                >
                  {/* Date & Time Block */}
                  <div className="flex items-center gap-3">
                    <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                    <span
                      className={cn(
                        CHIP,
                        "studiofloor-tnum font-bold text-accent",
                      )}
                    >
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                  </div>

                  {/* Class details */}
                  <div className="min-w-0 pr-2">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.35rem] leading-snug transition-colors group-hover:text-primary md:text-[1.5rem]",
                      )}
                    >
                      {e.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.92rem] text-muted-foreground">
                      <span>
                        {e.type === "onsite_event"
                          ? e.location || "Studio Floor"
                          : "Online Live Stream"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="studiofloor-display font-extrabold italic text-primary">
                        {eventPriceLabel(e)}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex items-center justify-end border-t border-border/60 pt-3 md:border-0 md:pt-0">
                    <span className="studiofloor-link inline-flex items-center gap-2 studiofloor-display text-[0.92rem] font-extrabold italic group-hover:text-accent">
                      <span>RESERVE SPOT</span>
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
              title="No upcoming sessions"
              text="Schedule a live studio session or workshop and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex justify-center">
            <SmartLink
              href="/calendar"
              className="group studiofloor-link inline-flex items-center gap-2 studiofloor-display text-[1rem] font-extrabold italic"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "VIEW FULL TIMETABLE"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
