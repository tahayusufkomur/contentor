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
import { Arrow, H3, LABEL, Opener, Section, WRAP, pad2 } from "./ui";

/** Course catalogue formatted as a numbered syllabus of units. */
export function CoursesSyllabus({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <ol className="mt-14 border-t-2 border-primary">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className="group grid items-start gap-x-6 gap-y-3 border-b border-border py-6 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
                >
                  <span className={cn(LABEL, "text-accent")} aria-hidden="true">
                    Unit {pad2(i)}
                  </span>
                  <div className="flex min-w-0 gap-5">
                    <Img
                      value={{ url: courseImage(c) }}
                      alt={c.title}
                      className="aspect-[4/3] w-24 shrink-0 border border-border"
                    />
                    <div className="min-w-0">
                      <h3
                        className={cn(
                          H3,
                          "text-[1.35rem] leading-tight md:text-[1.5rem]",
                        )}
                      >
                        {c.title}
                      </h3>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    {c.lesson_count ? (
                      <span className={cn(LABEL, "block text-primary")}>
                        {c.lesson_count}{" "}
                        {c.lesson_count === 1 ? "lesson" : "lessons"}
                      </span>
                    ) : null}
                    <CoursePrice
                      course={c}
                      className="primer-price mt-1 block font-display text-[1.15rem] font-semibold"
                    />
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink
              href="/courses"
              className="group primer-link inline-flex items-center gap-2 font-bold"
            >
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
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
