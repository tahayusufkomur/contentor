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
import { BTN_GHOST, CHIP, H3, Opener, Section, WRAP, str } from "./ui";

const lessons = (c: Course) =>
  c.lesson_count
    ? `${c.lesson_count} ${c.lesson_count === 1 ? "lesson" : "lessons"}`
    : "";

/** Courses as night cards under a warm glow, with price and lesson count. */
export function CoursesNights({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section tone="surface" label={str(block.heading) || "Courses"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!courses.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        ) : (
          <div className="mt-14 grid gap-6 sm:grid-cols-2 md:mt-16 lg:grid-cols-3">
            {courses.map((course) => (
              <SmartLink
                key={course.id}
                href={courseHref(course)}
                className="group block overflow-hidden rounded-[var(--radius)] border border-border bg-muted"
              >
                <Img
                  value={{ url: courseImage(course) }}
                  alt={course.title}
                  className="aspect-[4/3] w-full nocturne-zoom"
                />
                <div className="p-6">
                  {course.lesson_count ? (
                    <span className={CHIP}>{lessons(course)}</span>
                  ) : null}
                  <h3 className={cn(H3, "mt-4 text-[1.3rem] leading-snug")}>
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="mt-2 line-clamp-2 text-[0.95rem] text-muted-foreground">
                      {course.description}
                    </p>
                  )}
                  <CoursePrice
                    course={course}
                    className="nocturne-price mt-5 block text-[1.05rem] font-semibold text-primary"
                  />
                </div>
              </SmartLink>
            ))}
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-14 flex justify-center">
            <SmartLink href="/courses" className={BTN_GHOST}>
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
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
