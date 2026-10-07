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
  BTN,
  H3,
  LABEL,
  NUM,
  Opener,
  Section,
  Track,
  WRAP,
  pad2,
} from "./ui";

/** Course tracklist: catalogue rows formatted as a record's A/B sides with durations, thumbnail sleeves and prices. */
export function CoursesTracklist({ block, data, editable }: SectionProps) {
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
          <ol className="mt-12 border-t-[3px] border-foreground">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className="group grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-5 gap-y-3 border-b border-foreground py-5 sm:grid-cols-[3rem_5rem_minmax(0,1fr)_auto]"
                >
                  <Track>{pad2(i)}</Track>
                  <Img
                    value={{ url: courseImage(c) }}
                    alt={c.title}
                    className="encore-zoom hidden aspect-square w-20 sm:block"
                  />
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.25rem] uppercase md:text-[1.5rem]",
                      )}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-1 line-clamp-1 text-[0.92rem] text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div
                    className={cn(
                      LABEL,
                      NUM,
                      "col-start-2 shrink-0 sm:col-start-auto sm:text-right",
                    )}
                  >
                    {c.lesson_count ? (
                      <span className="block text-muted-foreground">
                        {c.lesson_count}{" "}
                        {c.lesson_count === 1 ? "lesson" : "lessons"}
                      </span>
                    ) : null}
                    <CoursePrice
                      course={c}
                      className="encore-price mt-1 block"
                    />
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink href="/courses" className={BTN}>
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
