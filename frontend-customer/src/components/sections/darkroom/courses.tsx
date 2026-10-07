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
  H3,
  LABEL,
  LINK,
  Opener,
  Plate,
  Section,
  WRAP,
  WallLabel,
  pad2,
} from "./ui";

/** Courses displayed as exhibition plates with uncropped imagery and wall labels. */
export function CoursesPlates({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!courses.length ? (
          <div className="mt-14 md:mt-20">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        ) : (
          <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 md:mt-20 lg:grid-cols-3">
            {courses.map((c, i) => (
              <SmartLink
                key={c.id}
                href={courseHref(c)}
                className="group block"
              >
                <Img
                  value={{ url: courseImage(c) }}
                  alt={c.title}
                  className="darkroom-zoom aspect-[4/5] w-full"
                />
                <WallLabel className="mt-5 max-w-none">
                  <div className="flex items-baseline justify-between gap-4">
                    <Plate>Plate {pad2(i)}</Plate>
                    <CoursePrice
                      course={c}
                      className="darkroom-price darkroom-mono darkroom-tnum text-[0.72rem] uppercase tracking-[0.1em]"
                    />
                  </div>
                  <h3 className={cn(H3, "mt-3 text-[1.2rem] leading-[1.2]")}>
                    {c.title}
                  </h3>
                  {c.description && (
                    <p className="mt-2 line-clamp-2 text-[0.92rem] leading-[1.6] text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  {Boolean(c.lesson_count) && (
                    <p className={cn(LABEL, "mt-3 text-muted-foreground")}>
                      {c.lesson_count}{" "}
                      {c.lesson_count === 1 ? "lesson" : "lessons"}
                    </p>
                  )}
                </WallLabel>
              </SmartLink>
            ))}
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-16 flex">
            <SmartLink href="/courses" className={cn(LINK, "group")}>
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
