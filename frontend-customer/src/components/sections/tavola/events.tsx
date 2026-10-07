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
import { Arrow, BTN_GHOST, CARD, H3, LABEL, Opener, Section, WRAP } from "./ui";

/** Live sessions and tastings presented as an upcoming schedule card with dotted rows. */
export function EventsTastings({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!events.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming sessions"
              text="Schedule a live class or event and it appears here."
            />
          </div>
        ) : (
          <div className={cn(CARD, "mx-auto mt-14 max-w-[56rem] p-6 md:p-8")}>
            <p className={LABEL}>Upcoming</p>
            <ol className="mt-2">
              {events.map((e) => (
                <li
                  key={`${e.type}-${e.id}`}
                  className="border-b-2 border-dotted border-border py-5 last:border-0"
                >
                  <SmartLink
                    href={eventHref(e)}
                    className="group grid items-baseline gap-x-6 gap-y-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                  >
                    <span className={LABEL}>
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                    <span className="min-w-0">
                      <h3
                        className={cn(
                          H3,
                          "text-[1.3rem] leading-snug md:text-[1.5rem]",
                        )}
                      >
                        {e.title}
                      </h3>
                      {e.location && (
                        <p className="mt-1 text-[0.92rem] text-muted-foreground">
                          {e.location}
                        </p>
                      )}
                    </span>
                    <span className="flex flex-col sm:items-end sm:text-right">
                      <span className="font-bold">{eventPriceLabel(e)}</span>
                      <span className="tavola-link mt-1 inline-flex items-center gap-2 text-[0.9rem] font-bold">
                        Reserve
                        <Arrow />
                      </span>
                    </span>
                  </SmartLink>
                </li>
              ))}
            </ol>
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex justify-center">
            <SmartLink href="/calendar" className={BTN_GHOST}>
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
          </div>
        )}
      </div>
    </Section>
  );
}
