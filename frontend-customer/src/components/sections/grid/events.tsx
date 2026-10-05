import type { CalendarEvent } from "@/types/live";
import { EmptyHint, SmartLink, Txt, eventHref, formatEventTime } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, row, textLink } from "./ui";

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : String(d.getDate()).padStart(2, "0");
};
const part = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, opts);
};
const priceOf = (e: CalendarEvent) =>
  e.pricing_type === "free" || !Number(e.price) ? "Free" : e.price;

/** Upcoming sessions as a timetable; each row inverts to cobalt on hover. */
export function EventsTable({ block, data, editable }: SectionProps) {
  const events = (data ?? []) as CalendarEvent[];
  if (!events.length && !editable) return null;

  const calendar = (
    <SmartLink href={editable ? null : "/calendar"} className={textLink}>
      {block.ctaLabel || editable ? (
        <Txt
          block={block}
          field="ctaLabel"
          editable={editable}
          placeholder="See the calendar"
        />
      ) : (
        "Full calendar"
      )}
    </SmartLink>
  );

  return (
    <Sheet>
      <Head
        block={block}
        editable={editable}
        aside={events.length ? calendar : undefined}
      />
      {!events.length ? (
        <div className="mt-14">
          <EmptyHint
            editable={editable}
            title="No upcoming sessions"
            text="Schedule a live class and it appears here automatically."
          />
        </div>
      ) : (
        <div className="mt-14 md:mt-20">
          <div
            aria-hidden="true"
            className={`${row} swiss-mono hidden pb-3 text-muted-foreground md:grid`}
          >
            <span className="col-span-3">Date</span>
            <span className="col-span-5">Session</span>
            <span className="col-span-2">Where</span>
            <span className="col-span-2 text-right">Price</span>
          </div>
          <ul className="border-b border-foreground">
            {events.map((e) => (
              <li
                key={`${e.type}-${e.id}`}
                className="border-t border-foreground"
              >
                <SmartLink
                  href={eventHref(e)}
                  className={`${row} swiss-row group items-baseline gap-y-2 py-5 hover:bg-primary hover:text-primary-foreground md:-mx-3 md:px-3 md:py-6`}
                >
                  <span className="col-span-12 flex items-baseline gap-3 md:col-span-3">
                    <span className="swiss-step tabular-nums">
                      {dayOf(e.scheduled_at)}
                    </span>
                    <span className="swiss-mono text-muted-foreground group-hover:text-primary-foreground">
                      <span className="block text-foreground group-hover:text-primary-foreground">
                        {part(e.scheduled_at, { month: "short" })}
                      </span>
                      {part(e.scheduled_at, { weekday: "short" })}{" "}
                      {formatEventTime(e.scheduled_at)}
                    </span>
                  </span>
                  <span className="swiss-h3 col-span-12 text-balance md:col-span-5">
                    {e.title}
                  </span>
                  <span className="swiss-mono col-span-6 text-muted-foreground group-hover:text-primary-foreground md:col-span-2">
                    {e.location}
                  </span>
                  <span className="swiss-mono col-span-6 text-right tabular-nums md:col-span-2">
                    {priceOf(e)}
                  </span>
                </SmartLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
