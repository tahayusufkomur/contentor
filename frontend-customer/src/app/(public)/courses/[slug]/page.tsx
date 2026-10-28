export const dynamic = "force-dynamic";

import { serverFetch } from "@/lib/api-server";
import { EnrollButton } from "@/components/public/enroll-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CoverArt } from "@/components/covers/cover-art";
import { courseItem } from "@/lib/covers/items";
import { formatDuration, formatMoney } from "@/lib/format";
import { BookOpen, Clock, Lock, Play, User } from "lucide-react";
import type { CourseDetail, Module } from "@/types/course";
import { getLocale, getTranslations } from "next-intl/server";

function getTotalDuration(modules: Module[]): number {
  return modules.reduce(
    (acc, m) => acc + m.lessons.reduce((a, l) => a + l.duration_seconds, 0),
    0,
  );
}

type SiteT = Awaited<ReturnType<typeof getTranslations<"site">>>;

function formatTotalDuration(seconds: number, t: SiteT): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return t("duration.hoursMinutes", { hours, minutes });
  return t("duration.minutes", { minutes });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("site");
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
        <h1 className="text-2xl font-bold">{t("course.notFound")}</h1>
        <p className="mt-2 text-muted-foreground">{t("course.notFoundText")}</p>
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
          {/* Thumbnail: the kept cover design, drawn live, or the photo. It leads the page. */}
          {course.cover_design ? (
            <div className="relative h-64 overflow-hidden rounded-[var(--radius)] md:h-80">
              <CoverArt
                design={course.cover_design}
                item={courseItem(course)}
                priority
              />
            </div>
          ) : course.thumbnail_signed_url || course.thumbnail_url ? (
            <div className="overflow-hidden rounded-[var(--radius)]">
              <img
                src={course.thumbnail_signed_url || course.thumbnail_url}
                alt={course.title}
                className="h-64 w-full object-cover md:h-80"
              />
            </div>
          ) : (
            <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-primary/20 to-accent/10 md:h-80">
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
                {t("course.byInstructor", { name: course.instructor_name })}
              </span>
            </div>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          </div>
        </div>

        {/* Sticky sidebar - price & enroll */}
        <div>
          <Card className="sticky top-24 rounded-[var(--radius)] ring-1 ring-primary/10">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <p className="font-display text-3xl font-bold">
                  {course.pricing_type === "free"
                    ? t("price.free")
                    : course.pricing_type === "subscription"
                      ? t("price.includedInSubscription")
                      : formatMoney(
                          course.access_info?.price ?? course.price,
                          course.access_info?.currency ||
                            course.unlock_options?.purchase?.currency ||
                            "USD",
                          locale,
                        )}
                </p>
              </div>
              <EnrollButton course={course} />
              <Separator />
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>{t("course.lessons", { count: totalLessons })}</span>
                </div>
                {totalDuration > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {t("course.totalDuration", {
                        duration: formatTotalDuration(totalDuration, t),
                      })}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span>
                    {t("course.modules", { count: course.modules.length })}
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
          {t("course.curriculum")}
        </h2>
        <div className="space-y-3">
          {course.modules.map((mod: Module) => (
            <Card
              key={mod.id}
              className="overflow-hidden rounded-[var(--radius)]"
            >
              <div className="bg-primary/5 px-4 py-3">
                <h3 className="font-display font-semibold">
                  {t("course.moduleTitle", {
                    number: mod.order,
                    title: mod.title,
                  })}
                </h3>
                <p className="mt-0.5 text-xs text-foreground">
                  {t("course.lessons", { count: mod.lessons.length })}
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
                          {t("course.freePreview")}
                        </Badge>
                      )}
                    </div>
                    {lesson.duration_seconds > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(lesson.duration_seconds)}
                      </span>
                    )}
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
