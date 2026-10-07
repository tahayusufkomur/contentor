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
import { Arrow, H3, LABEL, LINK, Opener, Section, WRAP } from "./ui";

/** Exhibition openings and live sessions listed on ruled gallery rows. */
export function EventsOpenings({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 border-b border-border border-t border-foreground md:mt-20">
            {events.map((e) => (
              <li
                key={`${e.type}-${e.id}`}
                className="border-t border-border first:border-t-0"
              >
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-8 gap-y-3 py-7 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                >
                  <span
                    className={cn(LABEL, "darkroom-tnum text-muted-foreground")}
                  >
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        H3,
                        "block text-[1.3rem] leading-tight md:text-[1.6rem]",
                      )}
                    >
                      {e.title}
                    </span>
                    {e.location && (
                      <span className="mt-1 block text-[0.92rem] text-muted-foreground">
                        {e.location}
                      </span>
                    )}
                  </span>
                  <span className="mt-2 flex items-center gap-6 sm:mt-0">
                    <span
                      className={cn(
                        LABEL,
                        "darkroom-tnum text-muted-foreground",
                      )}
                    >
                      {eventPriceLabel(e)}
                    </span>
                    <span className={cn(LINK, "group-hover:border-b-accent")}>
                      Reserve
                      <Arrow />
                    </span>
                  </span>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14 md:mt-20">
            <EmptyHint
              editable={editable}
              title="No upcoming sessions"
              text="Schedule a live class or event and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-14 flex md:mt-16">
            <SmartLink href="/calendar" className={cn(LINK, "group")}>
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
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
