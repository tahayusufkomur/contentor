import type { Course } from "@/types/course";
import { CoursePrice, EmptyHint, Img, SmartLink, Txt, courseHref, courseImage } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, pad, textLink } from "./ui";

/** Courses as a catalogue: square monochrome covers, a ruled meta line with
 *  number, lessons and price, then the title. */
export function CourseCatalogue({ block, data, editable }: SectionProps) {
  const limit = block.limit === "6" ? 6 : 3;
  const courses = ((data ?? []) as Course[]).slice(0, limit);
  if (!courses.length && !editable) return null;

  const seeAll = (
    <SmartLink href={editable ? null : "/courses"} className={textLink}>
      {block.ctaLabel || editable ? (
        <Txt block={block} field="ctaLabel" editable={editable} placeholder="See all courses" />
      ) : (
        "All courses"
      )}
    </SmartLink>
  );

  return (
    <Sheet>
      <Head block={block} editable={editable} aside={courses.length ? seeAll : undefined} />
      {courses.length ? (
        <ul className="mt-14 grid gap-x-4 gap-y-14 sm:grid-cols-2 md:mt-20 md:gap-x-6 lg:grid-cols-3">
          {courses.map((c, i) => (
            <li key={c.id}>
              <SmartLink href={courseHref(c)} className="swiss-card group block">
                <Img
                  value={{ url: courseImage(c) }}
                  alt={c.title}
                  className="swiss-photo aspect-square w-full"
                />
                <div className="swiss-mono mt-4 flex items-baseline gap-4 border-t border-foreground pt-3">
                  <span>({pad(i + 1)})</span>
                  {c.lesson_count ? (
                    <span className="text-muted-foreground">
                      {c.lesson_count} {c.lesson_count === 1 ? "lesson" : "lessons"}
                    </span>
                  ) : null}
                  <CoursePrice course={c} plain className="ml-auto text-foreground" />
                </div>
                <h3 className="swiss-h3 mt-4 text-balance decoration-1 underline-offset-[5px] group-hover:text-primary group-hover:underline">
                  {c.title}
                </h3>
                {c.description ? (
                  <p className="mt-3 line-clamp-2 max-w-[44ch] leading-[1.5] text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}
              </SmartLink>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-14">
          <EmptyHint
            editable={editable}
            title="No courses to show yet"
            text="Publish a course and it appears here automatically."
          />
        </div>
      )}
    </Sheet>
  );
}
