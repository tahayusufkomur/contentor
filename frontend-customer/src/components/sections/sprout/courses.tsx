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
  Opener,
  PILL,
  Section,
  SproutDoodle,
  WRAP,
  getSproutTint,
} from "./ui";

/** Course catalogue presented as a colourful activity tile grid with
 *  lesson chips and price bubbles. */
export function CourseShowcaseActivities({
  block,
  data,
  editable,
}: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      tone="paper"
      label={
        typeof block.heading === "string"
          ? block.heading
          : "Activities & Courses"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="left" />

        {courses.length ? (
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <SmartLink
                key={c.id}
                href={courseHref(c)}
                className={cn(
                  "group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] p-6 transition-all duration-200 motion-safe:hover:-translate-y-1.5 motion-safe:hover:shadow-lg",
                  getSproutTint(i),
                )}
              >
                <div>
                  {/* Activity Cover Image */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-muted shadow-sm">
                    {courseImage(c) ? (
                      <Img
                        value={{ url: courseImage(c) }}
                        alt={c.title}
                        className="h-full w-full"
                        imgClassName="transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[color-mix(in_oklch,var(--accent)_20%,var(--surface))]">
                        <SproutDoodle className="size-16 text-primary opacity-60" />
                      </div>
                    )}

                    {/* Lesson Count Chip */}
                    {c.lesson_count ? (
                      <div className="absolute left-3 top-3">
                        <span
                          className={cn(
                            PILL,
                            "bg-background/90 text-foreground shadow-sm backdrop-blur-sm",
                          )}
                        >
                          {c.lesson_count}{" "}
                          {c.lesson_count === 1 ? "lesson" : "lessons"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Course Info */}
                  <div className="mt-5">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.3rem] font-bold leading-snug text-foreground transition-colors group-hover:text-primary md:text-[1.45rem]",
                      )}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-2 line-clamp-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Price Bubble & Action footer */}
                <div className="mt-6 flex items-center justify-between border-t border-[color-mix(in_oklch,var(--border)_60%,transparent)] pt-4">
                  <div className="rounded-full bg-background px-4 py-1.5 shadow-sm">
                    <CoursePrice
                      course={c}
                      plain
                      className="font-display text-[1.05rem] font-bold text-foreground"
                    />
                  </div>

                  <span className="inline-flex items-center gap-1.5 font-display text-[0.92rem] font-bold text-primary transition-transform motion-safe:group-hover:translate-x-1">
                    <span>Explore</span>
                    <Arrow className="size-3.5" />
                  </span>
                </div>
              </SmartLink>
            ))}
          </div>
        ) : (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No published activities yet"
              text="Publish a course or program and it will appear here."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-12 flex justify-start">
            <SmartLink href="/courses" className={BTN}>
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "See all activities"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
