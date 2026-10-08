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
import { H3, HandArrow, Opener, PriceTag, Section, WRAP } from "./ui";

/** Workshop sessions and live studio classes listed as ticket stubs with perforated dashed borders. */
export function EventsSessions({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="kraft"
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ul className="mt-14 space-y-5">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group workshop-card-hover grid items-center gap-x-6 gap-y-4 rounded-[var(--radius)] border-2 border-dashed border-border bg-card p-6 transition-all focus-visible:outline-none sm:grid-cols-[12rem_minmax(0,1fr)_auto] shadow-xs"
                >
                  <div className="border-b border-dashed border-border pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
                    <span className="block text-[0.8rem] font-bold uppercase tracking-wider text-muted-foreground">
                      Session date
                    </span>
                    <span className="workshop-hand mt-1 block text-[1.25rem] font-bold leading-tight text-accent">
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.3rem] leading-tight md:text-[1.45rem]",
                      )}
                    >
                      {e.title}
                    </h3>
                    {e.location && (
                      <p className="mt-1 flex items-center gap-1.5 text-[0.92rem] text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-primary"
                        />
                        <span>{e.location}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                    <PriceTag price={eventPriceLabel(e)} />
                    <span className="workshop-hand inline-flex items-center gap-1.5 text-[1.1rem] font-bold text-accent transition-transform motion-safe:group-hover:translate-x-1">
                      <span>Reserve bench</span>
                      <HandArrow className="h-3 w-4" />
                    </span>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming workshop sessions"
              text="Schedule a live craft class or workshop and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink
              href="/calendar"
              className="group workshop-link inline-flex items-center gap-2 font-bold text-[1.05rem]"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "Full studio calendar"
              )}
              <HandArrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
