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
  NUM,
  Opener,
  Ref,
  RULE,
  Section,
  WRAP,
  pad2,
  str,
} from "./ui";

/** Courses as a dossier table: numbered rows between hairlines with framed
 *  thumbnails, lesson counts in mono, and plain-figure prices. */
export function CoursesDossier({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  const alt = str(block.heading) || "Courses";

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <div className="mt-14 md:mt-20">
            <div
              className={cn(
                RULE,
                "hidden border-b border-border py-3 sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:items-center sm:gap-x-6",
                LABEL,
                "ledger-dim",
              )}
            >
              <span>No.</span>
              <span>Course</span>
              <span>Lessons</span>
              <span className="text-right">Price</span>
            </div>

            <ul className="border-b border-border sm:border-b-0">
              {courses.map((c, i) => (
                <li key={c.id} className="border-b border-border">
                  <SmartLink
                    href={courseHref(c)}
                    className="group grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-4 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:items-center sm:gap-x-6"
                  >
                    <Ref className="pt-1 sm:pt-0">{pad2(i)}</Ref>

                    <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
                      <Img
                        value={{ url: courseImage(c) }}
                        alt={c.title}
                        className="ledger-frame aspect-[4/3] w-20 shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className={cn(H3, "text-[1.35rem] leading-snug")}>
                          {c.title}
                        </h3>
                        {c.description && (
                          <p className="mt-1 line-clamp-2 max-w-[50ch] text-[0.95rem] leading-[1.5] text-muted-foreground">
                            {c.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="col-start-2 mt-3 flex items-center justify-between sm:hidden">
                      <span className={cn(LABEL, NUM, "ledger-dim")}>
                        {c.lesson_count
                          ? `${c.lesson_count} ${c.lesson_count === 1 ? "lesson" : "lessons"}`
                          : ""}
                      </span>
                      <CoursePrice
                        course={c}
                        className="ledger-price ledger-tnum font-display text-[1.15rem]"
                      />
                    </div>

                    <span
                      className={cn(LABEL, NUM, "ledger-dim hidden sm:block")}
                    >
                      {c.lesson_count
                        ? `${c.lesson_count} ${c.lesson_count === 1 ? "lesson" : "lessons"}`
                        : "—"}
                    </span>

                    <div className="hidden sm:block sm:text-right">
                      <CoursePrice
                        course={c}
                        className="ledger-price ledger-tnum font-display text-[1.15rem]"
                      />
                    </div>
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
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
          <div className="mt-14 flex md:mt-20">
            <SmartLink
              href="/courses"
              className="group inline-flex items-center gap-3 text-[1rem] font-medium"
            >
              <span className="ledger-link">
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
