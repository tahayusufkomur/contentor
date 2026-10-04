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
import { Arrow, BTN, BtnBody, DISPLAY, H2, Kicker, LABEL, WRAP } from "./ui";

function day(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { wd: "", md: "" };
  return {
    wd: d.toLocaleDateString(undefined, { weekday: "short" }),
    md: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

/** Gym timetable: day, time, class, place, book. The next class is in volt. */
export function EventsTimetable({ block, data, editable }: SectionProps) {
  const events = Array.isArray(data) ? (data as CalendarEvent[]) : [];
  if (!events.length && !editable) return null;

  return (
    <section className="kinetic-paper py-20 md:py-32">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
          <div className="max-w-4xl">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-6 max-w-[54ch] text-lg leading-[1.55] text-muted-foreground"
            />
          </div>
          {events.length > 0 && (
            <SmartLink href="/calendar" className={BTN}>
              <BtnBody>
                {has(block, "ctaLabel", editable) ? (
                  <Txt block={block} field="ctaLabel" editable={editable} />
                ) : (
                  "Full calendar"
                )}
              </BtnBody>
            </SmartLink>
          )}
        </div>

        {events.length === 0 ? (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No upcoming live classes"
              text="Schedule a live class or event and it appears here in the timetable."
            />
          </div>
        ) : (
          <ol className="mt-12 border-t-[3px] border-foreground md:mt-16">
            {events.map((e, i) => {
              const { wd, md } = day(e.scheduled_at);
              const next = i === 0;
              return (
                <li
                  key={`${e.type}-${e.id}`}
                  className="border-b-2 border-foreground"
                >
                  <SmartLink
                    href={eventHref(e)}
                    className={cn(
                      "kinetic-focus group grid grid-cols-[4.25rem_1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-5 transition-colors sm:grid-cols-[6rem_8rem_1fr_auto] md:gap-x-8 md:px-5 md:py-6",
                      next
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="row-span-2 sm:row-span-1">
                      <span
                        className={cn(
                          DISPLAY,
                          "block [text-wrap:nowrap] text-[2.2rem] sm:text-[2.6rem] md:text-[3.25rem]",
                        )}
                      >
                        {wd}
                      </span>
                      <span className={cn(LABEL, "mt-1.5 block")}>{md}</span>
                    </span>
                    <span
                      className={cn(
                        DISPLAY,
                        "text-[1.6rem] tabular-nums md:text-[2rem] sm:[line-height:1]",
                      )}
                    >
                      {formatEventTime(e.scheduled_at)}
                    </span>
                    <span className="col-start-2 min-w-0 sm:col-start-auto">
                      <span
                        className={cn(
                          DISPLAY,
                          "block text-[1.5rem] [line-height:0.95] md:text-[2.1rem]",
                        )}
                      >
                        {e.title}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        {e.location && (
                          <span className={next ? "" : "text-muted-foreground"}>
                            {e.location}
                          </span>
                        )}
                        {e.pricing_type === "free" && (
                          <span
                            className={cn(
                              LABEL,
                              next
                                ? "bg-foreground px-1.5 py-1 text-accent"
                                : "bg-accent px-1.5 py-1 text-accent-foreground",
                            )}
                          >
                            Free
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={cn(
                        LABEL,
                        "col-start-3 row-start-1 row-end-3 inline-flex h-12 items-center justify-center gap-2 self-center px-3.5 text-[0.78rem] sm:px-4 transition-colors sm:col-start-auto sm:row-auto",
                        next
                          ? "bg-foreground text-background"
                          : "bg-primary text-primary-foreground group-hover:bg-foreground group-hover:text-background",
                      )}
                    >
                      <span className="max-sm:sr-only">Book</span>
                      <Arrow className="size-4" />
                    </span>
                  </SmartLink>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
