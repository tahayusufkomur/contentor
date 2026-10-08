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
import { Arrow, H3, Opener, Section, WindowChrome, WRAP } from "./ui";

function getCronExpression(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0 18 * * *";
  const min = d.getMinutes();
  const hour = d.getHours();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${min} ${hour} ${day} ${month} *`;
}

/** Live events and scheduled classes structured as crontab daemon schedule entries. */
export function EventsCron({ block, data, editable }: SectionProps) {
  const events: CalendarEvent[] = Array.isArray(data) ? data : [];
  if (!events.length && !editable) return null;

  return (
    <Section
      tone="console"
      label={typeof block.heading === "string" ? block.heading : "Events"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {events.length ? (
          <div className="mt-14">
            <WindowChrome
              title="/etc/crontab.d/schedule"
              tag="DAEMON"
              bodyClassName="p-3 sm:p-6 font-mono"
            >
              <div className="mb-4 pb-3 border-b border-border text-xs text-muted-foreground">
                <span className="text-primary font-bold">SCHEDULER:</span>{" "}
                active ·{" "}
                <span className="text-accent font-bold">NEXT RUN:</span>{" "}
                upcoming
              </div>

              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={`${e.type}-${e.id}`}>
                    <SmartLink
                      href={eventHref(e)}
                      className="group flex flex-col gap-3 rounded-[var(--radius)] p-4 transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                        <span
                          className="shrink-0 font-mono text-xs text-accent select-none"
                          aria-hidden="true"
                        >
                          {getCronExpression(e.scheduled_at)}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <h3
                              className={cn(
                                H3,
                                "truncate text-[1.05rem] font-bold text-foreground group-hover:text-primary sm:text-[1.15rem]",
                              )}
                            >
                              {e.title}
                            </h3>
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            <LocalWhen iso={e.scheduled_at} />
                            {e.location
                              ? ` · ${e.location}`
                              : " · Online, live"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-6 pl-0 sm:justify-end">
                        <span className="font-mono text-xs font-bold text-primary">
                          {eventPriceLabel(e)}
                        </span>

                        <span className="terminal-link inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                          <span>[ Reserve ]</span>
                          <Arrow />
                        </span>
                      </div>
                    </SmartLink>
                  </li>
                ))}
              </ul>
            </WindowChrome>
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No upcoming events scheduled"
              text="Schedule a live class or session and it appears in the crontab table."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || events.length > 0) && (
          <div className="mt-10 flex">
            <SmartLink
              href="/calendar"
              className="group terminal-link inline-flex items-center gap-2 font-mono text-[0.95rem] font-bold"
            >
              <span
                className="text-muted-foreground select-none"
                aria-hidden="true"
              >
                $ crontab -l
              </span>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "calendar/"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
