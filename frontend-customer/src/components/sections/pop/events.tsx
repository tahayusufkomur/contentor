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
import { FILL, Kicker, PopSection, WRAP } from "./ui";

const STUB: (keyof typeof FILL)[] = ["berry", "lime", "pink", "lilac"];

function dateParts(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString("en", { day: "numeric" }),
    month: d.toLocaleDateString("en", { month: "short" }),
    weekday: d.toLocaleDateString("en", { weekday: "short" }),
  };
}

/** Ticket stubs: a colour date block, a perforated fold, the details. */
export function EventsTickets({ block, data, editable }: SectionProps) {
  const events = Array.isArray(data) ? (data as CalendarEvent[]) : [];
  if (!events.length && !editable) return null;
  return (
    <PopSection bg="var(--pop-sun)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <div className="max-w-3xl">
            <Kicker block={block} editable={editable} fill="paper" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className="pop-display pop-h2 mt-6"
              placeholder="Heading"
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="pop-lede mt-6 max-w-[36rem] text-muted-foreground"
            />
          </div>
          {events.length > 0 && (
            <SmartLink href="/calendar" className="pop-btn pop-btn-paper">
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
          )}
        </div>

        {events.length === 0 ? (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No upcoming events"
              text="Scheduled live classes appear here automatically."
            />
          </div>
        ) : (
          <ul className="mt-14 grid gap-7 md:mt-16 lg:grid-cols-2">
            {events.map((e, i) => {
              const d = dateParts(e.scheduled_at);
              const fill = STUB[i % STUB.length];
              return (
                <li key={`${e.type}-${e.id}`}>
                  <SmartLink
                    href={eventHref(e)}
                    className="pop-card pop-lift group flex h-full overflow-hidden bg-[var(--pop-paper)] [--pop-r:1.25rem]"
                  >
                    <div
                      className={cn(
                        "flex w-[6.5rem] shrink-0 flex-col items-center justify-center px-3 py-6 text-center sm:w-32",
                        FILL[fill],
                      )}
                    >
                      {d && (
                        <>
                          <span className="pop-mono text-[0.8125rem]">
                            {d.weekday}
                          </span>
                          <span className="pop-display mt-1 text-[3.25rem] !leading-none sm:text-[4rem]">
                            {d.day}
                          </span>
                          <span className="pop-mono mt-1 text-[0.8125rem]">
                            {d.month}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="pop-ticket-cut flex min-w-0 flex-1 flex-col justify-center gap-3 border-l-2 border-dashed border-[color:var(--pop-ink)] py-6 pl-6 pr-5 sm:pl-8">
                      <h3 className="pop-h3 text-[1.5rem] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4 sm:text-[1.75rem]">
                        {e.title}
                      </h3>
                      <p className="pop-mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-muted-foreground">
                        <span>{formatEventTime(e.scheduled_at)}</span>
                        {e.location && <span>{e.location}</span>}
                        {e.pricing_type === "free" && (
                          <span className="rounded-full border-2 border-[color:var(--pop-ink)] bg-[var(--accent)] px-2.5 py-0.5 text-[0.75rem] text-[color:var(--foreground)]">
                            Free
                          </span>
                        )}
                      </p>
                    </div>
                  </SmartLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PopSection>
  );
}
