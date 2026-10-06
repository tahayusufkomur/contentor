import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";
import type { CalendarEvent } from "@/types/live";
import {
  EmptyHint,
  Img,
  SmartLink,
  Txt,
  courseHref,
  courseImage,
  coursePriceLabel,
  eventHref,
  eventPriceLabel,
  has,
} from "./kit";
import { LocalWhen } from "./local-time";
import type { SectionProps } from "./types";

// "rows": the streaming-service layout, shared by every style and drawn in
// its own tokens (inverse band, display font, radius, primary). The first
// item is a full-bleed billboard; the rest scroll sideways as 16:9 tiles.
// A row holds more than a grid does, so `limit` "6" shows up to 12.

const BAND =
  "bg-[var(--inverse)] text-[color:var(--inverse-foreground)] [--rows-dim:color-mix(in_oklch,var(--inverse-foreground)_68%,transparent)]";
const WRAP = "mx-auto w-full max-w-[84rem] px-5 md:px-10";
const PILL =
  "inline-flex items-center rounded-full px-3 py-1 text-[0.8rem] font-semibold";

function Billboard({
  href,
  image,
  title,
  description,
  meta,
  action,
}: {
  href: string;
  image: string | null;
  title: string;
  description?: string;
  meta: ReactNode;
  action: string;
}) {
  return (
    <SmartLink
      href={href}
      className="group relative block overflow-hidden rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Img
        value={{ url: image }}
        alt={title}
        priority
        className="aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[21/9]"
        imgClassName="transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.03]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,var(--inverse)_4%,color-mix(in_oklch,var(--inverse)_70%,transparent)_38%,transparent_72%),linear-gradient(to_right,color-mix(in_oklch,var(--inverse)_85%,transparent),transparent_60%)]"
      />
      <div className="absolute inset-x-0 bottom-0 max-w-2xl p-6 md:p-10">
        <div className="flex flex-wrap gap-2">{meta}</div>
        <h3 className="mt-4 font-display text-[clamp(2rem,1.3rem+2.6vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.02em]">
          {title}
        </h3>
        {description && (
          <p className="mt-3 line-clamp-3 max-w-[52ch] text-[1.02rem] leading-relaxed text-[color:var(--rows-dim)]">
            {description}
          </p>
        )}
        <span className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius)] bg-primary px-5 py-3 font-semibold text-primary-foreground transition-transform motion-safe:group-hover:translate-x-0.5">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-4 fill-current"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          {action}
        </span>
      </div>
    </SmartLink>
  );
}

function Tile({
  href,
  image,
  title,
  meta,
}: {
  href: string;
  image: string | null;
  title: string;
  meta: ReactNode;
}) {
  return (
    <li className="w-[78%] shrink-0 snap-start sm:w-[42%] lg:w-[calc((100%-3*1rem)/4)]">
      <SmartLink
        href={href}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative overflow-hidden rounded-[var(--radius)] transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.04]">
          <Img
            value={{ url: image }}
            alt={title}
            className="aspect-video w-full"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_oklch,var(--inverse)_92%,transparent),transparent_58%)]"
          />
          <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 font-display text-[1.05rem] font-semibold leading-tight">
            {title}
          </p>
        </div>
        <p className="mt-2 text-[0.85rem] text-[color:var(--rows-dim)]">
          {meta}
        </p>
      </SmartLink>
    </li>
  );
}

function Shell({
  block,
  editable,
  children,
}: SectionProps & { children: ReactNode }) {
  return (
    <section className={cn(BAND, "py-14 md:py-20")}>
      <div className={WRAP}>
        <div className="mb-8 max-w-3xl">
          {has(block, "kicker", editable) && (
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="p"
              className="text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-primary"
            />
          )}
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="mt-2 font-display text-[clamp(1.8rem,1.3rem+1.6vw,2.75rem)] font-bold leading-tight"
          />
          {has(block, "intro", editable) && (
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-3 max-w-[56ch] leading-relaxed text-[color:var(--rows-dim)]"
            />
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-10">
      <p className="mb-3 font-display text-[1.15rem] font-semibold">{label}</p>
      <ul className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-3 [scrollbar-width:thin] md:-mx-10 md:scroll-px-10 md:px-10">
        {children}
      </ul>
    </div>
  );
}

const count = (block: SectionProps["block"]) => (block.limit === "6" ? 12 : 6);

/** Courses as a streaming catalogue: the first course as a billboard, the
 *  rest in a sideways row. */
export function CoursesRows(props: SectionProps) {
  const { block, data, editable } = props;
  const courses = (Array.isArray(data) ? (data as Course[]) : []).slice(
    0,
    count(block),
  );
  if (!courses.length && !editable) return null;
  const [lead, ...rest] = courses;
  const lessons = (c: Course) =>
    c.lesson_count
      ? `${c.lesson_count} lesson${c.lesson_count === 1 ? "" : "s"}`
      : "";
  return (
    <Shell {...props}>
      {!lead ? (
        <EmptyHint
          editable={editable}
          title="No published courses yet"
          text="Publish a course and it leads this page like a film."
        />
      ) : (
        <>
          <Billboard
            href={courseHref(lead)}
            image={courseImage(lead)}
            title={lead.title}
            description={lead.description}
            action="Start the course"
            meta={
              <>
                <span
                  className={cn(PILL, "bg-primary text-primary-foreground")}
                >
                  {coursePriceLabel(lead) || "Course"}
                </span>
                {lessons(lead) && (
                  <span
                    className={cn(
                      PILL,
                      "bg-[color:color-mix(in_oklch,var(--inverse-foreground)_16%,transparent)]",
                    )}
                  >
                    {lessons(lead)}
                  </span>
                )}
              </>
            }
          />
          {rest.length > 0 && (
            <Row label="More courses">
              {rest.map((c) => (
                <Tile
                  key={c.id}
                  href={courseHref(c)}
                  image={courseImage(c)}
                  title={c.title}
                  meta={[coursePriceLabel(c), lessons(c)]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </Row>
          )}
        </>
      )}
    </Shell>
  );
}

/** Upcoming classes and events as a streaming lineup: the next one as a
 *  billboard with its date, the rest in a sideways row. */
export function EventsRows(props: SectionProps) {
  const { block, data, editable } = props;
  const events = (Array.isArray(data) ? (data as CalendarEvent[]) : []).slice(
    0,
    count(block),
  );
  if (!events.length && !editable) return null;
  const [next, ...rest] = events;
  return (
    <Shell {...props}>
      {!next ? (
        <EmptyHint
          editable={editable}
          title="No upcoming events yet"
          text="Schedule a class and the next one leads this page."
        />
      ) : (
        <>
          <Billboard
            href={eventHref(next)}
            image={next.thumbnail_signed_url}
            title={next.title}
            description={next.description}
            action="Save your spot"
            meta={
              <>
                <span
                  className={cn(PILL, "bg-primary text-primary-foreground")}
                >
                  <LocalWhen iso={next.scheduled_at} />
                </span>
                <span
                  className={cn(
                    PILL,
                    "bg-[color:color-mix(in_oklch,var(--inverse-foreground)_16%,transparent)]",
                  )}
                >
                  {next.type === "onsite_event"
                    ? next.location || "In person"
                    : "Online, live"}{" "}
                  · {eventPriceLabel(next)}
                </span>
              </>
            }
          />
          {rest.length > 0 && (
            <Row label="Coming up">
              {rest.map((e) => (
                <Tile
                  key={`${e.type}:${e.id}`}
                  href={eventHref(e)}
                  image={e.thumbnail_signed_url}
                  title={e.title}
                  meta={
                    <>
                      <LocalWhen iso={e.scheduled_at} /> · {eventPriceLabel(e)}
                    </>
                  }
                />
              ))}
            </Row>
          )}
        </>
      )}
    </Shell>
  );
}
