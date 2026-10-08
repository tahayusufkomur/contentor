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
import { Arrow, H3, Opener, Section, WindowChrome, WRAP, pad2 } from "./ui";

/** Course catalogue formatted as an interactive filesystem directory tree. */
export function CoursesModules({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="console"
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <div className="mt-14">
            <WindowChrome
              title="/var/www/courses/"
              tag="TREE"
              bodyClassName="p-3 sm:p-6 font-mono"
            >
              <div className="mb-4 pb-3 border-b border-border text-xs text-muted-foreground">
                <span className="text-primary font-bold">MODE:</span> 0755 ·{" "}
                <span className="text-accent font-bold">TOTAL:</span>{" "}
                {courses.length} modules
              </div>

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
                            value={{ url: courseImage(c) }}
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
                            <p className="font-mono text-[0.75rem] text-muted-foreground opacity-75">
                              {filename}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-6 pl-8 sm:justify-end sm:pl-0">
                          {c.lesson_count ? (
                            <span className="font-mono text-xs text-accent">
                              {c.lesson_count}{" "}
                              {c.lesson_count === 1 ? "lesson" : "lessons"}
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
                            open &gt;
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
              title="No published courses yet"
              text="Publish a course and it appears in the module tree automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-10 flex">
            <SmartLink
              href="/courses"
              className="group terminal-link inline-flex items-center gap-2 font-mono text-[0.95rem] font-bold"
            >
              <span
                className="text-muted-foreground select-none"
                aria-hidden="true"
              >
                $ ls -la
              </span>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "courses/"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
