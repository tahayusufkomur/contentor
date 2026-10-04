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
import { Arrow, BTN, BtnBody, DISPLAY, H2, Kicker, LABEL, WRAP } from "./ui";

function lessons(c: Course) {
  return c.lesson_count
    ? `${c.lesson_count} lesson${c.lesson_count === 1 ? "" : "s"}`
    : null;
}

function MetaBar({ course }: { course: Course }) {
  const count = lessons(course);
  return (
    <div
      className={cn(
        LABEL,
        "flex h-14 items-stretch bg-[var(--inverse)] text-[0.78rem] tabular-nums text-[color:var(--inverse-foreground)]",
      )}
    >
      {count && (
        <span className="flex items-center border-r-2 border-[color:var(--k-rule)] px-5">
          {count}
        </span>
      )}
      <CoursePrice
        course={course}
        plain
        className="flex items-center px-5 text-accent"
      />
      <span className="ml-auto grid w-14 place-items-center bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Arrow />
      </span>
    </div>
  );
}

function Poster({ course }: { course: Course }) {
  return (
    <SmartLink
      href={courseHref(course)}
      className="kinetic-focus-out group block [--k-rule:color-mix(in_oklch,var(--inverse-foreground)_22%,transparent)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--inverse)]">
        <Img
          value={{ url: courseImage(course) }}
          alt={course.title}
          className="absolute inset-0"
          imgClassName="grayscale contrast-[1.15] transition duration-500 ease-out group-hover:scale-[1.04] group-hover:grayscale-0"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--inverse)_0%,color-mix(in_oklch,var(--inverse)_55%,transparent)_35%,transparent_65%)]"
        />
        <h3
          className={cn(
            DISPLAY,
            "absolute inset-x-0 bottom-0 p-5 text-[clamp(2rem,1.4rem+1.6vw,2.9rem)] text-[color:var(--inverse-foreground)] md:p-6",
          )}
        >
          {course.title}
        </h3>
      </div>
      <MetaBar course={course} />
    </SmartLink>
  );
}

/** One course: a wide feature poster instead of a lonely card. */
function Feature({ course }: { course: Course }) {
  return (
    <SmartLink
      href={courseHref(course)}
      className="kinetic-focus-out group grid bg-[var(--inverse)] text-[color:var(--inverse-foreground)] [--k-rule:color-mix(in_oklch,var(--inverse-foreground)_22%,transparent)] lg:grid-cols-12"
    >
      <Img
        value={{ url: courseImage(course) }}
        alt={course.title}
        className="aspect-[4/3] lg:col-span-7 lg:aspect-auto lg:min-h-[30rem]"
        imgClassName="grayscale contrast-[1.15] transition duration-500 group-hover:grayscale-0"
      />
      <div className="flex flex-col justify-between gap-10 lg:col-span-5">
        <div className="p-6 md:p-10">
          <h3
            className={cn(DISPLAY, "text-[clamp(2.4rem,1.5rem+2.6vw,4.25rem)]")}
          >
            {course.title}
          </h3>
          {course.description && (
            <p className="mt-5 line-clamp-4 max-w-[46ch] leading-[1.6] text-[color:color-mix(in_oklch,var(--inverse-foreground)_74%,transparent)]">
              {course.description}
            </p>
          )}
        </div>
        <div className="border-t-2 border-[color:var(--k-rule)]">
          <MetaBar course={course} />
        </div>
      </div>
    </SmartLink>
  );
}

/** Poster cards: greyscale 4:5 photos that light up on hover, caps titles
 *  over the image and a black meta bar. */
export function CoursesPosters({ block, data, editable }: SectionProps) {
  const limit = block.limit === "6" ? 6 : 3;
  const courses = (Array.isArray(data) ? (data as Course[]) : []).slice(
    0,
    limit,
  );
  if (!courses.length && !editable) return null;

  return (
    <section className="kinetic-paper py-20 md:py-32">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8 border-b-[3px] border-foreground pb-10">
          <div className="max-w-4xl">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-6 max-w-[54ch] text-lg leading-[1.55] text-muted-foreground"
            />
          </div>
          {courses.length > 0 && (
            <SmartLink href="/courses" className={BTN}>
              <BtnBody>
                {has(block, "ctaLabel", editable) ? (
                  <Txt block={block} field="ctaLabel" editable={editable} />
                ) : (
                  "All courses"
                )}
              </BtnBody>
            </SmartLink>
          )}
        </div>

        {courses.length === 0 ? (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here as a poster card."
            />
          </div>
        ) : courses.length === 1 ? (
          <div className="mt-12">
            <Feature course={courses[0]} />
          </div>
        ) : (
          <ul
            className={cn(
              "mt-12 grid gap-x-5 gap-y-10 sm:grid-cols-2",
              courses.length !== 2 && courses.length !== 4 && "lg:grid-cols-3",
            )}
          >
            {courses.map((c) => (
              <li key={c.id}>
                <Poster course={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
