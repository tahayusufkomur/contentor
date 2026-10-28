import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";
import {
  CoursePrice,
  EmptyHint,
  Img,
  SmartLink,
  Txt,
  courseCover,
  courseHref,
  has,
} from "../kit";
import type { SectionProps } from "../types";
import { BTN_GHOST, CARD, H3, Leader, Opener, Section, WRAP } from "./ui";
import { useTranslations } from "next-intl";

/** Courses presented as trattoria recipe cards with dotted price and lesson leaders. */
export function CoursesRecipeCards({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      label={
        typeof block.heading === "string"
          ? block.heading
          : t("sectionLabel.courses")
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!courses.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title={t("empty.courses.title")}
              text={t("empty.courses.text")}
            />
          </div>
        ) : (
          <ul className="mt-14 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id}>
                <SmartLink
                  href={courseHref(course)}
                  className={cn(
                    "group flex h-full flex-col overflow-hidden",
                    CARD,
                  )}
                >
                  <Img
                    value={courseCover(course)}
                    alt={course.title}
                    className="aspect-[4/3] w-full tavola-zoom"
                  />
                  <div className="flex flex-1 flex-col p-6">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.35rem] leading-snug md:text-[1.5rem]",
                      )}
                    >
                      {course.title}
                    </h3>
                    {course.description && (
                      <p className="mt-2 line-clamp-2 text-[0.95rem] text-muted-foreground">
                        {course.description}
                      </p>
                    )}
                    <div className="mt-auto pt-5">
                      {Boolean(course.lesson_count) && (
                        <Leader
                          label={t("table.lessons")}
                          value={course.lesson_count}
                        />
                      )}
                      <Leader
                        label={t("table.price")}
                        value={
                          <CoursePrice
                            course={course}
                            plain
                            className="tavola-price font-bold text-foreground"
                          />
                        }
                        className={course.lesson_count ? "mt-2" : undefined}
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
                  placeholder={t("placeholder.buttonText")}
                />
              ) : (
                t("cta.allCourses")
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
