import { cn } from "@/lib/utils";
import { CourseCatalogClient } from "@/components/public/course-catalog-client";
import type { CourseCardVariant } from "@/components/public/course-card";
import type { Course } from "@/types/course";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function CourseGridBlock({ data, dynamicData }: BlockComponentProps) {
  let courses: Course[] = dynamicData ?? [];
  const limit = Number(data.limit) || 0;
  if (limit > 0) courses = courses.slice(0, limit);
  const centered = data.layout === "centered";

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl space-y-6 px-4">
        {data.heading && (
          <h2
            className={cn(
              "font-display text-3xl font-bold tracking-tight",
              centered && "text-center",
            )}
          >
            {data.heading}
          </h2>
        )}
        <CourseCatalogClient
          courses={courses}
          columns={Number(data.columns) || 3}
          cardStyle={(data.cardStyle as CourseCardVariant) || "elevated"}
          showFilters={data.showFilters !== false}
          showPrice={data.showPrice !== false}
          showMeta={data.showMeta !== false}
          filterGroupIds={
            Array.isArray(data.filterGroups)
              ? (data.filterGroups as number[])
              : []
          }
        />
      </div>
    </section>
  );
}
