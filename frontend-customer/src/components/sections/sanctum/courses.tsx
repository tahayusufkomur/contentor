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
  BTN_GHOST,
  H3,
  Opener,
  ROMAN,
  Section,
  StarGlyph,
  WRAP,
  str,
} from "./ui";
import { useTranslations } from "next-intl";

/** Courses "paths": tall sacred tarot-card style cards with Roman numerals and ornate gold frames. */
export function CoursesPaths({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={str(block.heading) || t("sanctum.sacredPaths")}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!courses.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title={t("sanctum.emptyCoursesTitle")}
              text={t("sanctum.emptyCoursesText")}
            />
          </div>
        ) : (
          <div className="mt-14 grid gap-8 sm:grid-cols-2 md:mt-16 lg:grid-cols-3">
            {courses.map((course, i) => (
              <SmartLink
                key={course.id}
                href={courseHref(course)}
                className="group sanctum-tarot-card relative flex flex-col justify-between overflow-hidden rounded-[var(--radius)] border border-[color-mix(in_oklch,var(--primary)_38%,var(--border))] bg-[color-mix(in_oklch,var(--background)_80%,transparent)] p-6 text-center"
              >
                {/* 4 Corner Ornaments */}
                <span
                  aria-hidden="true"
                  className="absolute left-2 top-2 size-2.5 border-l border-t border-[color-mix(in_oklch,var(--primary)_70%,transparent)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 size-2.5 border-r border-t border-[color-mix(in_oklch,var(--primary)_70%,transparent)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-2 left-2 size-2.5 border-b border-l border-[color-mix(in_oklch,var(--primary)_70%,transparent)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-2 right-2 size-2.5 border-b border-r border-[color-mix(in_oklch,var(--primary)_70%,transparent)]"
                />

                {/* Card Header: Roman Numeral & Key */}
                <div className="flex items-center justify-between border-b border-[color-mix(in_oklch,var(--primary)_20%,transparent)] pb-3">
                  <span className="font-display text-[0.95rem] font-medium tracking-[0.2em] text-primary">
                    {ROMAN[i % ROMAN.length]}
                  </span>
                  {course.lesson_count ? (
                    <span className="text-[0.75rem] uppercase tracking-[0.14em] text-muted-foreground">
                      {t("course.lessons", { count: course.lesson_count })}
                    </span>
                  ) : (
                    <StarGlyph className="size-3 text-[color-mix(in_oklch,var(--primary)_60%,transparent)]" />
                  )}
                </div>

                {/* Card Photo Window (Arch). A cover she designed draws whole in a plain rounded frame: the
                    arch would cut off its logo and its badge in the top corners. */}
                <figure
                  className={cn(
                    "my-5 overflow-hidden border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] p-1",
                    course.cover_design
                      ? "rounded-[var(--radius)]"
                      : "rounded-t-full",
                  )}
                >
                  <Img
                    value={courseCover(course)}
                    alt={course.title}
                    className={cn(
                      "aspect-[4/3] w-full transition-transform duration-700 motion-safe:group-hover:scale-105",
                      course.cover_design
                        ? "rounded-[calc(var(--radius)-4px)]"
                        : "sanctum-arch",
                    )}
                  />
                </figure>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <h3
                      className={cn(
                        H3,
                        "text-[1.2rem] leading-snug transition-colors group-hover:text-primary md:text-[1.3rem]",
                      )}
                    >
                      {course.title}
                    </h3>
                    {course.description && (
                      <p className="mt-2.5 line-clamp-2 text-pretty text-[0.92rem] leading-[1.6] text-muted-foreground">
                        {course.description}
                      </p>
                    )}
                  </div>

                  {/* Card Foot: Price and Initiation */}
                  <div className="mt-6 flex items-center justify-between border-t border-[color-mix(in_oklch,var(--primary)_20%,transparent)] pt-4">
                    <CoursePrice
                      course={course}
                      plain
                      className="font-display text-[1.1rem] font-medium tracking-[0.04em] text-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 font-display text-[0.78rem] uppercase tracking-[0.14em] text-foreground transition-transform duration-300 motion-safe:group-hover:translate-x-1">
                      <span>{t("dojo.begin")}</span>
                      <StarGlyph className="size-2.5 text-primary" />
                    </span>
                  </div>
                </div>
              </SmartLink>
            ))}
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
                  placeholder={t("placeholder.buttonText")}
                />
              ) : (
                t("sanctum.explorePaths")
              )}
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
