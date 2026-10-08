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
  BeltStripe,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  beltRank,
} from "./ui";

/** Courses catalogue formatted as a ranked progression of belt levels. */
export function CoursesBelts({ block, data, editable }: SectionProps) {
  const limit = Number(block.limit) === 6 ? 6 : 3;
  const courses: Course[] = Array.isArray(data) ? data.slice(0, limit) : [];
  if (!courses.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Courses"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {courses.length ? (
          <ul className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <li key={c.id}>
                <SmartLink
                  href={courseHref(c)}
                  className="group flex h-full flex-col border border-border bg-background transition-all hover:border-foreground/40 hover:shadow-md"
                >
                  <BeltStripe index={i} className="h-1.5" />
                  <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 bg-muted/20">
                    <span className={cn(LABEL, "text-accent")}>
                      {beltRank(i)}
                    </span>
                    {c.lesson_count ? (
                      <span className="dojo-tnum text-[0.78rem] font-medium text-muted-foreground">
                        {c.lesson_count}{" "}
                        {c.lesson_count === 1 ? "lesson" : "lessons"}
                      </span>
                    ) : null}
                  </div>

                  <div className="dojo-photo aspect-[16/10] w-full border-b border-border/60">
                    <Img
                      value={{ url: courseImage(c) }}
                      alt={c.title}
                      className="h-full w-full"
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.25rem] leading-snug text-foreground transition-colors group-hover:text-accent",
                      )}
                    >
                      {c.title}
                    </h3>
                    {c.description && (
                      <p className="mt-2.5 line-clamp-2 text-[0.92rem] leading-relaxed text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-5 mt-6">
                      <CoursePrice
                        course={c}
                        className="dojo-price font-display text-[1.15rem] font-bold text-foreground"
                      />
                      <span className="inline-flex items-center gap-1.5 text-[0.85rem] font-bold text-foreground group-hover:text-accent transition-colors">
                        <span>Begin</span>
                        <Arrow />
                      </span>
                    </div>
                  </div>
                </SmartLink>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No published courses yet"
              text="Publish a course and it appears here ranked by belt."
            />
          </div>
        )}

        {(has(block, "ctaLabel", editable) || courses.length > 0) && (
          <div className="mt-12 flex">
            <SmartLink
              href="/courses"
              className="group dojo-link inline-flex items-center gap-2 font-bold text-[0.95rem]"
            >
              {has(block, "ctaLabel", editable) ? (
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              ) : (
                "All courses & syllabus"
              )}
              <Arrow />
            </SmartLink>
          </div>
        )}
      </div>
    </Section>
  );
}
