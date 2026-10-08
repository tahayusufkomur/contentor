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
import { Arrow, DoubleRule, H3, Opener, Section, WRAP } from "./ui";

/** Programme of readings, colloquia, and live sessions set out as a literary
 *  calendar with small-caps dates and reserve actions. */
export function EventsReadings({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={
        typeof block.heading === "string"
          ? block.heading
          : "Programme of Readings"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <div className="mx-auto mt-12 max-w-[54rem]">
            <DoubleRule className="my-6" />

            <ol className="divide-y divide-border">
              {events.map((e) => (
                <li key={`${e.type}-${e.id}`}>
                  <SmartLink
                    href={eventHref(e)}
                    className="group grid items-baseline gap-x-6 gap-y-2 py-5 transition-colors duration-200 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
                  >
                    <span className="manuscript-small-caps text-[0.92rem] font-semibold text-accent">
                      <LocalWhen iso={e.scheduled_at} />
                    </span>

                    <div className="min-w-0">
                      <h3
                        className={cn(
                          H3,
                          "text-[1.25rem] font-normal leading-snug transition-colors group-hover:text-accent md:text-[1.45rem]",
                        )}
                      >
                        {e.title}
                      </h3>
                      {e.location && (
                        <p className="mt-1 font-display text-[0.92rem] italic text-muted-foreground">
                          {e.location}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col sm:items-end sm:text-right">
                      <span className="manuscript-small-caps text-xs font-semibold text-accent">
                        {eventPriceLabel(e)}
                      </span>
                      <span className="manuscript-link mt-1 inline-flex items-center gap-1.5 text-[0.92rem] font-medium text-foreground group-hover:text-accent">
                        <span>Reserve a seat</span>
                        <Arrow />
                      </span>
                    </div>
                  </SmartLink>
                </li>
              ))}
            </ol>

            <DoubleRule className="my-6" />
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming readings scheduled"
              text="Schedule a live colloquium or workshop and it appears in the programme automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-10 flex justify-center">
            <SmartLink
              href="/calendar"
              className="group manuscript-link inline-flex items-center gap-2 text-[1rem] font-medium"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "View full programme"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
