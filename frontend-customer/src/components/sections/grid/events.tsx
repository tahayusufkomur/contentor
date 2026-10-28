import type { CalendarEvent } from "@/types/live";
import {
  EmptyHint,
  SmartLink,
  Txt,
  eventHref,
  eventPriceLabel,
  formatEventTime,
} from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, row, textLink } from "./ui";
import { useLocale, useTranslations } from "next-intl";

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : String(d.getDate()).padStart(2, "0");
};
const part = (
  iso: string,
  opts: Intl.DateTimeFormatOptions,
  locale: string,
) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, opts);
};

/** Upcoming sessions as a timetable; each row inverts to cobalt on hover. */
export function EventsTable({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const events = (data ?? []) as CalendarEvent[];
  if (!events.length && !editable) return null;

  const calendar = (
    <SmartLink href={editable ? null : "/calendar"} className={textLink}>
      {block.ctaLabel || editable ? (
        <Txt
          block={block}
          field="ctaLabel"
          editable={editable}
          placeholder={t("grid.seeTheCalendar")}
        />
      ) : (
        t("cta.fullCalendar")
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
            title={t("empty.sessions.title")}
            text={t("grid.emptyEventsText")}
          />
        </div>
      ) : (
        <div className="mt-14 md:mt-20">
          <div
            aria-hidden="true"
            className={`${row} swiss-mono hidden pb-3 text-muted-foreground md:grid`}
          >
            <span className="col-span-3">{t("table.date")}</span>
            <span className="col-span-5">{t("table.session")}</span>
            <span className="col-span-2">{t("table.where")}</span>
            <span className="col-span-2 text-right">{t("table.price")}</span>
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
                        {part(e.scheduled_at, { month: "short" }, locale)}
                      </span>
                      {part(e.scheduled_at, { weekday: "short" }, locale)}{" "}
                      {formatEventTime(e.scheduled_at, locale)}
                    </span>
                  </span>
                  <span className="swiss-h3 col-span-12 text-balance md:col-span-5">
                    {e.title}
                  </span>
                  <span className="swiss-mono col-span-6 text-muted-foreground group-hover:text-primary-foreground md:col-span-2">
                    {e.location}
                  </span>
                  <span className="swiss-mono col-span-6 text-right tabular-nums md:col-span-2">
                    {eventPriceLabel(e, locale, t)}
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
