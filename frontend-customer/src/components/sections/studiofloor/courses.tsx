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
import { Arrow, CHIP, H3, Opener, Section, WRAP, pad2, str } from "./ui";

const lessons = (c: Course) =>
  c.lesson_count
    ? `${c.lesson_count} ${c.lesson_count === 1 ? "lesson" : "lessons"}`
    : "";

/** Course catalogue formatted as a dance studio setlist / playlist with
 *  track numbers, lesson chips, neon prices, and glowing hover states. */
export function CourseShowcaseSetlist({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section tone="surface" label={str(block.heading) || "Courses"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} cue="SETLIST" />

        {courses.length ? (
          <ol className="mt-14 space-y-4">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className="group studiofloor-card studiofloor-row-hover grid items-center gap-y-4 rounded-[var(--radius)] p-5 md:grid-cols-[4rem_auto_minmax(0,1fr)_auto] md:gap-x-6 md:p-6"
                >
                  {/* Track number */}
                  <div className="flex items-center gap-2 md:justify-center">
                    <span
                      aria-hidden="true"
                      className="studiofloor-display text-2xl font-extrabold italic text-muted-foreground transition-colors duration-200 group-hover:text-primary group-hover:studiofloor-glow-primary md:text-3xl"
                    >
                      {pad2(i)}
                    </span>
                  </div>

                  {/* Thumbnail */}
                  <div className="relative w-28 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border/80 shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_15%,transparent)] sm:w-36">
                    <Img
                      value={{ url: courseImage(c) }}
                      alt={c.title}
                      className="aspect-[16/10] w-full"
                    />
                  </div>

                  {/* Title & meta */}
                  <div className="min-w-0 pr-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {lessons(c) && (
                        <span className={CHIP}>
                          <span className="size-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
                          {lessons(c)}
                        </span>
                      )}
                    </div>
                    <h3
                      className={cn(
                        H3,
                        "mt-2 text-[1.35rem] leading-snug transition-colors group-hover:text-primary md:text-[1.5rem]",
                      )}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-1.5 line-clamp-2 max-w-[50ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Action */}
                  <div className="flex items-center justify-between border-t border-border/60 pt-3 md:flex-col md:items-end md:justify-center md:border-0 md:pt-0 md:text-right">
                    <CoursePrice
                      course={c}
                      className="studiofloor-price studiofloor-display text-[1.25rem] font-extrabold italic text-primary"
                    />
                    <span className="studiofloor-link mt-2 inline-flex items-center gap-2 studiofloor-display text-[0.88rem] font-extrabold italic group-hover:text-accent">
                      <span>ENTER SET</span>
                      <Arrow />
                    </span>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it joins the studio setlist automatically."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-12 flex justify-center">
            <SmartLink
              href="/courses"
              className="group studiofloor-link inline-flex items-center gap-2 studiofloor-display text-[1rem] font-extrabold italic"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "EXPLORE FULL SETLIST"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
