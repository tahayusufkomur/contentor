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
  BTN_GHOST,
  H3,
  MoonGlyph,
  Opener,
  Section,
  StarGlyph,
  WRAP,
} from "./ui";

/** Events "gatherings": Ceremonial live gatherings with moon-phase glyphs per alignment date. */
export function EventsGatherings({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="temple"
      label={typeof block.heading === "string" ? block.heading : "Gatherings"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 border-t border-[color-mix(in_oklch,var(--primary)_35%,var(--border))]">
            {events.map((e, i) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-center gap-x-6 gap-y-3 border-b border-[color-mix(in_oklch,var(--primary)_20%,transparent)] py-6 transition-colors motion-safe:hover:bg-[color-mix(in_oklch,var(--primary)_5%,transparent)] sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:px-4"
                >
                  {/* Moon Phase & Date */}
                  <div className="flex items-center gap-3">
                    <MoonGlyph phase={i} className="size-4 text-primary" />
                    <span className="font-display text-[0.88rem] uppercase tracking-[0.14em] text-primary">
                      <LocalWhen iso={e.scheduled_at} />
                    </span>
                  </div>

                  {/* Title & Location */}
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.2rem] leading-tight transition-colors group-hover:text-primary md:text-[1.4rem]",
                      )}
                    >
                      {e.title}
                    </h3>
                    {e.location && (
                      <p className="mt-1 flex items-center gap-1.5 text-[0.92rem] text-muted-foreground">
                        <StarGlyph className="size-2 text-[color-mix(in_oklch,var(--primary)_60%,transparent)]" />
                        <span>{e.location}</span>
                      </p>
                    )}
                  </div>

                  {/* Price & Action */}
                  <div className="flex items-center gap-6 sm:justify-end">
                    <span className="font-display text-[1rem] uppercase tracking-[0.1em] text-foreground">
                      {eventPriceLabel(e)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-display text-[0.8rem] uppercase tracking-[0.14em] text-primary transition-transform duration-300 motion-safe:group-hover:translate-x-1">
                      <span>Reserve</span>
                      <StarGlyph className="size-2.5 text-primary" />
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
              title="No upcoming gatherings scheduled"
              text="Schedule a live circle or ritual session and it will appear here under the moon."
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
                "Full gathering calendar"
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
