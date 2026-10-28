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
import {
  Arrow,
  BTN,
  FRAME,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  roman,
} from "./ui";
import { useTranslations } from "next-intl";

/** The course collection: looks in 3:4 plates with tracked caps numbering, lesson count and price. */
export function CoursesCollection({ block, data, editable }: SectionProps) {
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

        {courses.length ? (
          <ul className="mt-16 grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink href={courseHref(c)} className="group block">
                  <div className={FRAME}>
                    <Img
                      value={courseCover(c)}
                      alt={c.title}
                      className="maison-zoom aspect-[3/4] w-full"
                    />
                  </div>
                  <p
                    className={cn(
                      LABEL,
                      "mt-5 text-center text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {t("maison.look", { numeral: roman(i) })}
                  </p>
                  <h3
                    className={cn(
                      H3,
                      "mt-3 text-center text-[1.3rem] md:text-[1.45rem]",
                    )}
                  >
                    {c.title}
                  </h3>
                  {c.description && (
                    <p className="mt-2 line-clamp-2 text-center font-light text-[0.95rem] text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  <div
                    className={cn(
                      LABEL,
                      "mt-4 flex items-baseline justify-center gap-6 text-muted-foreground",
                    )}
                  >
                    {c.lesson_count ? (
                      <span>
                        {t("course.lessons", { count: c.lesson_count })}
                      </span>
                    ) : null}
                    <CoursePrice course={c} className="maison-price" />
                  </div>
                </SmartLink>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title={t("empty.courses.title")}
              text={t("empty.courses.text")}
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-16 flex justify-center">
            <SmartLink href="/courses" className={cn(BTN, "group")}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder={t("placeholder.buttonText")}
                />
              ) : (
                t("maison.theCollection")
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
