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
import { Kicker, PopSection, WRAP } from "./ui";

const BAND = ["bg-[var(--accent)]", "bg-[var(--card)]", "bg-[var(--pop-sun)]"];

/** Trading cards: a colour frame around the cover, the price as a tilted
 *  sticker, title and description on paper. */
export function CoursesCards({ block, data, editable }: SectionProps) {
  const courses = (Array.isArray(data) ? (data as Course[]) : []).slice(
    0,
    block.limit === "6" ? 6 : 3,
  );
  if (!courses.length && !editable) return null;
  const solo = courses.length === 1;
  return (
    <PopSection bg="var(--pop-pink)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <div className="max-w-3xl">
            <Kicker block={block} editable={editable} fill="paper" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className="pop-display pop-h2 mt-6"
              placeholder="Heading"
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="pop-lede mt-6 max-w-[36rem] text-muted-foreground"
            />
          </div>
          {courses.length > 0 && (
            <SmartLink href="/courses" className="pop-btn pop-btn-paper">
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
          )}
        </div>

        {courses.length === 0 ? (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No courses yet"
              text="Published courses appear here automatically."
            />
          </div>
        ) : (
          <ul
            className={cn(
              "mt-14 grid gap-x-7 gap-y-10 md:mt-16",
              solo ? "max-w-4xl" : "sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className={cn(
                    "pop-card pop-lift group flex h-full flex-col overflow-hidden bg-[var(--pop-paper)]",
                    solo && "md:flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "relative border-b-2 border-[color:var(--pop-ink)] p-3 pb-6",
                      solo &&
                        "md:w-[55%] md:shrink-0 md:border-b-0 md:border-r-2 md:pb-3 md:pr-6",
                      BAND[i % BAND.length],
                    )}
                  >
                    <Img
                      value={{ url: courseImage(c) }}
                      alt={c.title}
                      className="aspect-[4/3] w-full rounded-[1.1rem] border-2 border-[color:var(--pop-ink)]"
                    />
                    <CoursePrice
                      course={c}
                      plain
                      className={cn(
                        "pop-sticker pop-h3 absolute -bottom-4 right-5 z-[1] bg-[var(--primary)] px-4 py-1.5 text-lg text-[color:var(--primary-foreground)] [--pop-tilt:6deg]",
                        solo && "md:-right-6 md:bottom-8",
                      )}
                    />
                  </div>
                  <div
                    className={cn(
                      "flex flex-1 flex-col px-6 pb-7 pt-7",
                      solo && "md:justify-center md:px-9",
                    )}
                  >
                    {typeof c.lesson_count === "number" &&
                      c.lesson_count > 0 && (
                        <p className="pop-mono text-[0.8125rem] text-muted-foreground">
                          {c.lesson_count}{" "}
                          {c.lesson_count === 1 ? "lesson" : "lessons"}
                        </p>
                      )}
                    <h3
                      className={cn(
                        "pop-h3 mt-2 text-[1.75rem]",
                        solo && "md:text-[2.25rem]",
                        "group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4",
                      )}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-3 line-clamp-3 text-base leading-relaxed text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                  </div>
                </SmartLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PopSection>
  );
}
