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
import { Arrow, LABEL, NUM, Opener, RULE, Section, WRAP, str } from "./ui";

/** Events formatted as an agenda table: running head, tabular when/session/where/fee
 *  columns, and reserve links with hairlines. */
export function EventsAgenda({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  const alt = str(block.heading) || "Events";

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <div className="mt-14 md:mt-20">
            <div
              className={cn(
                RULE,
                "hidden border-b border-border py-3 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)_9rem_6rem] sm:items-center sm:gap-x-6",
                LABEL,
                "ledger-dim",
              )}
            >
              <span>When</span>
              <span>Session</span>
              <span>Where</span>
              <span className="text-right">Fee</span>
            </div>

            <ul className="border-b border-border sm:border-b-0">
              {events.map((e) => (
                <li
                  key={`${e.type}-${e.id}`}
                  className="border-b border-border"
                >
                  <SmartLink
                    href={eventHref(e)}
                    className="group grid grid-cols-1 gap-y-3 py-6 sm:grid-cols-[11rem_minmax(0,1fr)_9rem_6rem] sm:items-center sm:gap-x-6"
                  >
                    <div
                      className={cn(
                        NUM,
                        LABEL,
                        "text-[0.85rem] text-muted-foreground",
                      )}
                    >
                      <LocalWhen iso={e.scheduled_at} />
                    </div>

                    <div className="min-w-0">
                      <span className="block text-balance break-words font-display text-[1.4rem] leading-snug md:text-[1.7rem]">
                        {e.title}
                      </span>
                    </div>

                    <div className="text-[0.95rem] text-muted-foreground">
                      {e.type === "onsite_event"
                        ? e.location || "In person"
                        : "Online, live"}
                    </div>

                    <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center">
                      <span className={cn(NUM, "font-display text-[1.15rem]")}>
                        {eventPriceLabel(e)}
                      </span>
                      <span className="inline-flex items-center gap-2 text-[0.85rem] font-medium sm:mt-1">
                        <span className="ledger-link">Reserve</span>
                        <Arrow />
                      </span>
                    </div>
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
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
          <div className="mt-14 flex md:mt-20">
            <SmartLink
              href="/calendar"
              className="group inline-flex items-center gap-3 text-[1rem] font-medium"
            >
              <span className="ledger-link">
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
