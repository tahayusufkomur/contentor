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
  BTN_GHOST,
  H3,
  HandArrow,
  Opener,
  PriceTag,
  Section,
  WRAP,
  pad2,
} from "./ui";

/** Project index cards with ruled lines, project numbers, and craft price tags. */
export function CourseShowcaseProjects({
  block,
  data,
  editable,
}: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="kraft"
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!courses.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published projects yet"
              text="Publish a course and it appears here as a workshop project."
            />
          </div>
        ) : (
          <ul className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, idx) => (
              <li key={course.id}>
                <SmartLink
                  href={courseHref(course)}
                  className="group workshop-card-hover flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs focus-visible:outline-none"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    <Img
                      value={{ url: courseImage(course) }}
                      alt={course.title}
                      className="h-full w-full"
                    />
                    <div
                      aria-hidden="true"
                      className="workshop-tape pointer-events-none absolute -top-2.5 right-4 z-10 h-5 w-16 rotate-[6deg]"
                    />
                  </div>

                  <div className="workshop-lined flex flex-1 flex-col p-6">
                    <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-3">
                      <span className="workshop-hand text-[1.1rem] font-bold text-accent">
                        Project {pad2(idx)}
                      </span>
                      {course.lesson_count ? (
                        <span className="text-[0.82rem] font-semibold text-muted-foreground">
                          {course.lesson_count}{" "}
                          {course.lesson_count === 1 ? "lesson" : "lessons"}
                        </span>
                      ) : null}
                    </div>

                    <h3
                      className={cn(
                        H3,
                        "mt-3 text-[1.3rem] leading-snug md:text-[1.4rem]",
                      )}
                    >
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="mt-2 line-clamp-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                        {course.description}
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                      <PriceTag
                        price={
                          <CoursePrice
                            course={course}
                            plain
                            className="workshop-price"
                          />
                        }
                      />
                      <span className="workshop-hand inline-flex items-center gap-1.5 text-[1.1rem] font-bold text-accent transition-transform motion-safe:group-hover:translate-x-1">
                        <span>Make this</span>
                        <HandArrow className="h-3 w-4" />
                      </span>
                    </div>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ul>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-14 flex">
            <SmartLink href="/courses" className={BTN_GHOST}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "All workshop projects"
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
