import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/live";
import {
  EmptyHint,
  SmartLink,
  Txt,
  eventHref,
  formatEventTime,
  has,
} from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, LABEL, Section, WRAP } from "./ui";

function dateParts(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.getDate(),
    month: d.toLocaleDateString(undefined, { month: "short" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
  };
}

/** Upcoming sessions printed like a concert programme: the date as a large
 *  serif figure, then the title, time and place on one ruled line. */
export function EventsProgramme({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-10">
          <div className="lg:col-span-7">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-5 block max-w-[18ch]")}
            />
          </div>
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            placeholder="Intro"
            className="block max-w-[44ch] self-end text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        </div>

        {events.length ? (
          <ol className="mt-14 border-y border-foreground md:mt-20">
            {events.map((e) => {
              const d = dateParts(e.scheduled_at);
              return (
                <li
                  key={`${e.type}-${e.id}`}
                  className="border-t border-border first:border-t-0"
                >
                  <SmartLink
                    href={eventHref(e)}
                    className="group grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-5 py-8 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] md:gap-x-10 md:py-10"
                  >
                    <span className="row-span-2 flex flex-col sm:row-span-1">
                      <span className="journal-lnum font-display text-[3.4rem] font-light leading-[0.85] tracking-[-0.03em] md:text-[4.5rem]">
                        {d?.day}
                      </span>
                      <span className={cn(LABEL, "mt-2 text-muted-foreground")}>
                        {d?.month}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-balance break-words font-display text-[1.5rem] leading-tight md:text-[2rem]">
                        {e.title}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.975rem] text-muted-foreground">
                        <span>
                          {d?.weekday}, {formatEventTime(e.scheduled_at)}
                        </span>
                        {e.location && (
                          <span className="font-display italic">
                            {e.location}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="col-start-2 mt-5 inline-flex items-center gap-3 text-[0.95rem] font-medium sm:col-start-3 sm:mt-0">
                      <span className="journal-link">Reserve</span>
                      <Arrow />
                    </span>
                  </SmartLink>
                </li>
              );
            })}
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
          <div className="mt-12 flex md:mt-16">
            <SmartLink
              href="/calendar"
              className="group inline-flex items-center gap-3 text-[1rem] font-medium"
            >
              <span className="journal-link">
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
              </span>
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
