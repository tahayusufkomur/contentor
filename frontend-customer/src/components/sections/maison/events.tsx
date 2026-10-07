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
import { Arrow, BTN, H3, LABEL, NUM, Opener, Section, WRAP } from "./ui";

/** Salons: upcoming calendar sessions set as ruled lines with client-side local times. */
export function EventsSalons({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mx-auto mt-16 max-w-[56rem] border-t border-foreground">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-8 gap-y-2 border-b border-border py-7 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
                >
                  <span className={cn(LABEL, NUM, "text-muted-foreground")}>
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <span className="min-w-0">
                    <h3 className={cn(H3, "text-[1.3rem] md:text-[1.55rem]")}>
                      {e.title}
                    </h3>
                    {e.location && (
                      <p className="mt-1 font-light text-[0.95rem] text-muted-foreground">
                        {e.location}
                      </p>
                    )}
                  </span>
                  <span className="flex flex-col items-start sm:items-end sm:text-right">
                    <span className={cn(LABEL, NUM)}>{eventPriceLabel(e)}</span>
                    <span
                      className={cn(
                        LABEL,
                        "maison-link mt-2 inline-flex items-center gap-3",
                      )}
                    >
                      Request a seat
                      <Arrow />
                    </span>
                  </span>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming salons"
              text="Schedule a salon or event and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-16 flex justify-center">
            <SmartLink href="/calendar" className={cn(BTN, "group")}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "All salons"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
