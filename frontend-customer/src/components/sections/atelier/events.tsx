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
import {
  Arrow,
  BTN_GHOST,
  Diamond,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  str,
} from "./ui";

/** Upcoming masterclasses, workshops and live sessions styled as formal invitations. */
export function EventsMasterclasses({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section label={str(block.heading) || "Masterclasses"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 divide-y divide-[color-mix(in_oklch,var(--border)_80%,transparent)] border-y border-[color-mix(in_oklch,var(--border)_80%,transparent)]">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-8 gap-y-3 py-7 transition-colors duration-200 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
                >
                  <div className="flex items-baseline gap-2">
                    <Diamond className="translate-y-[-0.1em]" />
                    <span className="font-display text-[1.125rem] italic text-accent">
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.35rem] leading-snug transition-colors group-hover:text-primary md:text-[1.5rem]",
                      )}
                    >
                      {e.title}
                    </h3>
                    {e.location && (
                      <p className="mt-1 text-[0.92rem] text-muted-foreground">
                        {e.location}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:items-end sm:text-right">
                    <span className={cn(LABEL, "text-foreground")}>
                      {eventPriceLabel(e)}
                    </span>
                    <span className="atelier-link mt-2 inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-muted-foreground group-hover:text-primary">
                      <span>Reserve spot</span>
                      <Arrow />
                    </span>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming masterclasses"
              text="Schedule a live masterclass or workshop and it appears here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-14 flex justify-center">
            <SmartLink href="/calendar" className={BTN_GHOST}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "View full calendar"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
