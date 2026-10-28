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
import { Arrow, H3, LABEL, Opener, Section, WRAP } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Term dates and live session schedule listed as courier timetable entries. */
export function EventsTermDates({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      label={
        typeof block.heading === "string"
          ? block.heading
          : t("sectionLabel.events")
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <ol className="mt-14 border-t-2 border-primary">
            {events.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <SmartLink
                  href={eventHref(e)}
                  className="group grid items-baseline gap-x-6 gap-y-2 border-b border-border py-6 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                >
                  <span className="primer-courier text-[0.9rem] text-accent">
                    <LocalWhen iso={e.scheduled_at} />
                  </span>
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.3rem] leading-tight md:text-[1.55rem]",
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
                    <span className={cn(LABEL, "text-primary")}>
                      {eventPriceLabel(e, locale, t)}
                    </span>
                    <span className="primer-link mt-1 inline-flex items-center gap-2 font-bold group-hover:text-accent">
                      <span>{t("event.reserve")}</span>
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
              title={t("empty.sessions.title")}
              text={t("empty.sessions.text")}
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink
              href="/calendar"
              className="group primer-link inline-flex items-center gap-2 font-bold"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder={t("placeholder.buttonText")}
                />
              ) : (
                t("cta.fullCalendar")
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
