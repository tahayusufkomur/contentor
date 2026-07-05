export const dynamic = "force-dynamic";

import { serverFetch } from "@/lib/api-server";
import { EnrollButton } from "@/components/public/enroll-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDuration } from "@/lib/format";
import { BookOpen, Clock, Lock, Play, User } from "lucide-react";
import type { CourseDetail, Module } from "@/types/course";

function getTotalDuration(modules: Module[]): number {
  return modules.reduce(
    (acc, m) => acc + m.lessons.reduce((a, l) => a + l.duration_seconds, 0),
    0,
  );
}

function formatTotalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let course: CourseDetail | null = null;
  try {
    course = await serverFetch<CourseDetail>(`/api/v1/courses/${slug}/`);
  } catch {
    course = null;
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-2xl font-bold">Course not found</h1>
        <p className="mt-2 text-muted-foreground">
          The course you are looking for does not exist or has been removed.
        </p>
      </div>
    );
  }

  const totalLessons = course.modules.reduce(
    (acc, m) => acc + m.lessons.length,
    0,
  );
  const totalDuration = getTotalDuration(course.modules);

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Thumbnail */}
          {course.thumbnail_url ? (
            <div className="overflow-hidden rounded-xl">
              <img
                src={course.thumbnail_signed_url || course.thumbnail_url}
                alt={course.title}
                className="h-64 w-full object-cover md:h-80"
              />
            </div>
          ) : (
            <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 md:h-80">
              <span className="text-7xl font-bold text-primary/30">
                {course.title.charAt(0)}
              </span>
            </div>
          )}

          {/* Course info */}
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              {course.title}
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">
                By {course.instructor_name}
              </span>
            </div>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          </div>
        </div>

        {/* Sticky sidebar - price & enroll */}
        <div>
          <Card className="sticky top-24 ring-1 ring-primary/10">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <p className="font-display text-3xl font-bold">
                  {course.pricing_type === "free"
                    ? "Free"
                    : course.pricing_type === "subscription"
                      ? "Included in subscription"
                      : `$${course.price}`}
                </p>
              </div>
              <EnrollButton course={course} />
              <Separator />
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>
                    {totalLessons} lesson{totalLessons !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{formatTotalDuration(totalDuration)} total</span>
                </div>
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span>
                    {course.modules.length} module
                    {course.modules.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Curriculum */}
      <div>
        <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
          Curriculum
        </h2>
        <div className="space-y-3">
          {course.modules.map((mod: Module) => (
            <Card key={mod.id} className="overflow-hidden">
              <div className="bg-primary/5 px-4 py-3">
                <h3 className="font-semibold">
                  Module {mod.order}: {mod.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mod.lessons.length} lesson
                  {mod.lessons.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="divide-y">
                {mod.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {lesson.is_free_preview ? (
                        <Play className="h-4 w-4 text-primary" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground/50" />
                      )}
                      <span className="text-sm">{lesson.title}</span>
                      {lesson.is_free_preview && (
                        <Badge variant="success" className="text-[10px]">
                          Free Preview
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(lesson.duration_seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
