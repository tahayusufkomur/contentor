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
  ARCH,
  Arrow,
  BTN_GHOST,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  str,
} from "./ui";

/** Courses presented as a luxury spa treatment menu with arch thumbnails and dotted leaders. */
export function CoursesTreatments({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section label={str(block.heading) || "Treatments"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <ol className="mt-14 divide-y divide-[color-mix(in_oklch,var(--border)_80%,transparent)] border-y border-[color-mix(in_oklch,var(--border)_80%,transparent)]">
            {courses.map((c) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className="group grid items-center gap-x-6 gap-y-4 py-6 transition-colors duration-200 sm:grid-cols-[5rem_minmax(0,1fr)] md:grid-cols-[6rem_minmax(0,1fr)]"
                >
                  <Img
                    value={{ url: courseImage(c) }}
                    alt={c.title}
                    className={cn(
                      ARCH,
                      "aspect-[3/4] w-20 shrink-0 border border-[color-mix(in_oklch,var(--border)_75%,transparent)] sm:w-full",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <h3
                          className={cn(
                            H3,
                            "text-[1.35rem] leading-snug transition-colors group-hover:text-primary md:text-[1.5rem]",
                          )}
                        >
                          {c.title}
                        </h3>
                        <span
                          aria-hidden="true"
                          className="atelier-dots hidden min-w-[2rem] flex-1 translate-y-[-0.25em] self-end sm:block"
                        />
                      </div>
                      <div className="mt-1 shrink-0 sm:mt-0 sm:text-right">
                        <CoursePrice
                          course={c}
                          plain
                          className="font-display text-[1.25rem] font-medium text-foreground"
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {c.description && (
                        <p className="line-clamp-2 max-w-[50ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                      {Boolean(c.lesson_count) && (
                        <span
                          className={cn(
                            LABEL,
                            "ml-auto shrink-0 text-muted-foreground",
                          )}
                        >
                          {c.lesson_count}{" "}
                          {c.lesson_count === 1 ? "ritual" : "rituals"}
                        </span>
                      )}
                    </div>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published treatments yet"
              text="Publish a course and it appears here as a treatment."
            />
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
                "View all treatments"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
