import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";
import {
  CoursePrice,
  EmptyHint,
  Img,
  SmartLink,
  Txt,
  courseHref,
  courseImage,
  has,
} from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, H3, Kicker, LABEL, Section, WRAP } from "./ui";

const lessons = (c: Course) =>
  c.lesson_count
    ? `${c.lesson_count} ${c.lesson_count === 1 ? "lesson" : "lessons"}`
    : "";

/** Meta line under a cover: lesson count left, price right, on one hairline. */
function Meta({ course, className }: { course: Course; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-border pb-3 text-muted-foreground",
        className,
      )}
    >
      <span className={LABEL}>{lessons(course)}</span>
      <CoursePrice
        course={course}
        className="journal-price journal-lnum font-display text-[1.15rem] text-foreground"
      />
    </div>
  );
}

/** The lead course, set as a cover story. */
function Lead({ course }: { course: Course }) {
  return (
    <SmartLink
      href={courseHref(course)}
      className="group grid gap-y-8 md:grid-cols-12 md:items-center md:gap-x-10"
    >
      <Img
        value={{ url: courseImage(course) }}
        alt={course.title}
        className="journal-zoom aspect-[4/5] w-full md:col-span-6 lg:col-span-5"
      />
      <div className="md:col-span-6 lg:col-span-6 lg:col-start-7">
        <Meta course={course} />
        <h3
          className={cn(
            H3,
            "mt-7 font-light text-[clamp(2rem,1.4rem+2.4vw,3.6rem)] leading-[1.05] tracking-[-0.018em]",
          )}
        >
          {course.title}
        </h3>
        {course.description && (
          <p className="mt-6 line-clamp-4 max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground">
            {course.description}
          </p>
        )}
        <span className="mt-8 inline-flex items-center gap-3 text-[0.95rem] font-medium">
          <span className="journal-link">View course</span>
          <Arrow />
        </span>
      </div>
    </SmartLink>
  );
}

function Card({ course, wide }: { course: Course; wide: boolean }) {
  return (
    <SmartLink href={courseHref(course)} className="group block">
      <Img
        value={{ url: courseImage(course) }}
        alt={course.title}
        className={cn(
          "journal-zoom w-full",
          wide ? "aspect-[3/2]" : "aspect-[4/5]",
        )}
      />
      <Meta course={course} className="mt-5" />
      <h3
        className={cn(
          H3,
          "mt-4 text-[1.45rem] leading-[1.15] md:text-[1.6rem]",
        )}
      >
        {course.title}
      </h3>
      {course.description && (
        <p className="mt-3 line-clamp-2 max-w-[44ch] text-[0.975rem] leading-[1.6] text-muted-foreground">
          {course.description}
        </p>
      )}
    </SmartLink>
  );
}

/** Column span (of 6) for the rest of the issue: a row of two wide covers
 *  whenever three-across would leave a gap, three-across otherwise. */
function span(i: number, n: number) {
  if (n % 3 === 0) return "lg:col-span-2";
  const wide = n % 3 === 2 ? 2 : 4;
  return i < wide ? "lg:col-span-3" : "lg:col-span-2";
}

/** The course catalogue as a magazine issue: a cover story, then the rest. */
export function CoursesIssue({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;
  const [lead, ...rest] = courses;
  const n = rest.length;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-10">
          <div className="lg:col-span-7">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-5 block max-w-[18ch]")}
            />
          </div>
          <div className="self-end lg:col-span-4 lg:col-start-9">
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="block max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        {!lead ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        ) : (
          <>
            <div className="mt-14 border-t border-foreground pt-10 md:mt-20 md:pt-14">
              <Lead course={lead} />
            </div>
            {n > 0 && (
              <div className="mt-16 grid gap-x-8 gap-y-14 border-t border-border pt-12 sm:grid-cols-2 md:mt-24 lg:grid-cols-6 lg:gap-x-10">
                {rest.map((c, i) => (
                  <div key={c.id} className={span(i, n)}>
                    <Card
                      course={c}
                      wide={n % 3 !== 0 && i < (n % 3 === 2 ? 2 : 4)}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-16 flex md:mt-20">
            <SmartLink
              href="/courses"
              className="group inline-flex items-center gap-3 text-[1rem] font-medium"
            >
              <span className="journal-link">
                {has(block, "ctaLabel", editable) ? (
                  <Txt
                    block={block}
                    field="ctaLabel"
                    editable={editable}
                    placeholder="Button text"
                  />
                ) : (
                  "All courses"
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
