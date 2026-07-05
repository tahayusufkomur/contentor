import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CourseCard } from "@/components/public/course-card";
import type { LandingCourses } from "@/types/tenant";
import type { Course } from "@/types/course";

interface CoursesSectionProps {
  data: LandingCourses;
  courses: Course[];
}

export function CoursesSection({ data, courses }: CoursesSectionProps) {
  if (!data.enabled) return null;
  const featured = courses.slice(0, 3);
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
          {courses.length > 3 && (
            <Link
              href="/courses"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {featured.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-brand-surface p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No courses published yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
