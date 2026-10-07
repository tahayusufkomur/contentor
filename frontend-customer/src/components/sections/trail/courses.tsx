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
  CARD,
  H3,
  LABEL,
  Opener,
  Section,
  Stat,
  WRAP,
  pad2,
} from "./ui";

/** Course catalogue as trail routes: route cards with lesson count and price stats. */
export function CoursesRoutes({ block, data, editable }: SectionProps) {
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
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here automatically."
            />
          </div>
        ) : (
          <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className={cn(
                    CARD,
                    "group flex h-full flex-col overflow-hidden",
                  )}
                >
                  <Img
                    value={{ url: courseImage(c) }}
                    alt={c.title}
                    className="aspect-[16/10] w-full trail-zoom"
                  />
                  <div className="flex flex-1 flex-col p-6">
                    <p className={cn(LABEL, "text-primary")} aria-hidden="true">
                      Route {pad2(i)}
                    </p>
                    <h3
                      className={cn(H3, "mt-2 text-[1.3rem] md:text-[1.45rem]")}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-2 line-clamp-2 text-[0.95rem] text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-5">
                      <Stat
                        value={c.lesson_count ? `${c.lesson_count}` : "—"}
                        label="lessons"
                      />
                      <Stat
                        value={
                          <CoursePrice
                            course={c}
                            plain
                            className="trail-price"
                          />
                        }
                        label="price"
                      />
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
                "All routes"
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
