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
import {
  Arrow,
  DoubleRule,
  H3,
  NUM,
  Opener,
  Section,
  WRAP,
  toRoman,
} from "./ui";

/** Course catalogue presented as a formal Table of Contents with Roman numerals,
 *  dotted leaders, cover plates, and lessons/prices formatted as page numbers. */
export function CoursesContents({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="paper"
      label={
        typeof block.heading === "string" ? block.heading : "Table of Contents"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <div className="mx-auto mt-12 max-w-[54rem]">
            <DoubleRule className="my-6" />

            <ol className="divide-y divide-border">
              {courses.map((course, i) => (
                <li key={course.id}>
                  <SmartLink
                    href={courseHref(course)}
                    className="group flex flex-col gap-3 py-5 transition-colors duration-200 sm:flex-row sm:items-center sm:gap-5"
                  >
                    <span className="manuscript-small-caps w-8 shrink-0 text-base font-semibold text-accent">
                      {toRoman(i + 1)}.
                    </span>

                    {courseImage(course) && (
                      <div className="manuscript-plate hidden size-16 shrink-0 overflow-hidden sm:block">
                        <Img
                          value={{ url: courseImage(course) }}
                          alt={course.title}
                          className="size-full"
                        />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3
                        className={cn(
                          H3,
                          "text-[1.25rem] font-normal leading-snug transition-colors group-hover:text-accent md:text-[1.4rem]",
                        )}
                      >
                        {course.title}
                      </h3>
                      {course.description && (
                        <p className="mt-1 line-clamp-1 max-w-[44ch] text-[0.92rem] text-muted-foreground">
                          {course.description}
                        </p>
                      )}
                    </div>

                    <span
                      aria-hidden="true"
                      className="manuscript-dots mb-1.5 hidden min-w-[2rem] flex-1 self-end sm:block"
                    />

                    <div className="flex shrink-0 items-baseline gap-4 sm:flex-col sm:items-end sm:gap-1">
                      {Boolean(course.lesson_count) && (
                        <span className="manuscript-small-caps text-[0.8rem] text-muted-foreground">
                          {course.lesson_count}{" "}
                          {course.lesson_count === 1 ? "lesson" : "lessons"}
                        </span>
                      )}
                      <span
                        className={cn(
                          NUM,
                          "font-display text-[1.15rem] font-medium text-foreground",
                        )}
                      >
                        <CoursePrice course={course} plain />
                      </span>
                    </div>
                  </SmartLink>
                </li>
              ))}
            </ol>

            <DoubleRule className="my-6" />
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears in the Table of Contents automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-10 flex justify-center">
            <SmartLink
              href="/courses"
              className="group manuscript-link inline-flex items-center gap-2 text-[1rem] font-medium"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "View full catalogue"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}

export { CoursesContents as CourseShowcaseContents };
