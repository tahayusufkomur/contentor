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
import { Arrow, H3, Opener, Section, WindowChrome, WRAP, pad2 } from "./ui";
import { useTranslations } from "next-intl";

/** Course catalogue formatted as an interactive filesystem directory tree. */
export function CoursesModules({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="console"
      label={
        typeof block.heading === "string"
          ? block.heading
          : t("sectionLabel.courses")
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <div className="mt-14">
            <WindowChrome bodyClassName="p-3 sm:p-6 font-mono">
              <ul className="space-y-1">
                {courses.map((c, i) => {
                  const isLast = i === courses.length - 1;
                  const glyph = isLast ? "└──" : "├──";
                  const filename = `${pad2(i)}_${c.slug || "course"}.md`;

                  return (
                    <li key={c.id}>
                      <SmartLink
                        href={courseHref(c)}
                        className="group flex flex-col gap-3 rounded-[var(--radius)] p-3 transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="font-mono text-sm text-primary select-none opacity-80"
                            aria-hidden="true"
                          >
                            {glyph}
                          </span>

                          <Img
                            value={courseCover(c)}
                            alt={c.title}
                            className="size-10 shrink-0 rounded-[var(--radius)] border border-border"
                          />

                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span
                                className="text-xs text-muted-foreground select-none"
                                aria-hidden="true"
                              >
                                ./
                              </span>
                              <h3
                                className={cn(
                                  H3,
                                  "truncate text-[1.05rem] font-bold text-foreground group-hover:text-primary sm:text-[1.15rem]",
                                )}
                              >
                                {c.title}
                              </h3>
                            </div>
                            <p className="font-mono text-[0.75rem] text-muted-foreground">
                              {filename}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-6 pl-8 sm:justify-end sm:pl-0">
                          {c.lesson_count ? (
                            <span className="font-mono text-xs text-accent">
                              {t("course.lessons", { count: c.lesson_count })}
                            </span>
                          ) : null}

                          <CoursePrice
                            course={c}
                            className="terminal-price font-mono text-[1.05rem] font-bold text-foreground group-hover:text-primary"
                          />

                          <span
                            className="hidden font-mono text-xs text-primary opacity-0 transition-opacity motion-safe:group-hover:opacity-100 sm:inline"
                            aria-hidden="true"
                          >
                            {t("terminal.open")} &gt;
                          </span>
                        </div>
                      </SmartLink>
                    </li>
                  );
                })}
              </ul>
            </WindowChrome>
          </div>
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
          <div className="mt-10 flex">
            <SmartLink
              href="/courses"
              className="group terminal-link inline-flex items-center gap-2 font-mono text-[0.95rem] font-bold"
            >
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
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
