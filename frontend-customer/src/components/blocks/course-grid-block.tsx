import { CourseCatalogClient } from "@/components/public/course-catalog-client";
import type { Course } from "@/types/course";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function CourseGridBlock({ data, dynamicData }: BlockComponentProps) {
  let courses: Course[] = dynamicData ?? [];
  const limit = Number(data.limit) || 0;
  if (limit > 0) courses = courses.slice(0, limit);

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl space-y-6 px-4">
        {data.heading && (
          <h2 className="font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
        )}
        <CourseCatalogClient courses={courses} />
      </div>
    </section>
  );
}
