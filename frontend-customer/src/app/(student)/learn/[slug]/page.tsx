"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { clientFetch } from "@/lib/api-client";
import { VideoPlayer } from "@/components/student/video-player";
import { LessonSidebar } from "@/components/student/lesson-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { CourseDetail, Lesson, Progress } from "@/types/course";

export default function LearnPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [progressMap, setProgressMap] = useState<Record<number, Progress>>({});
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    loadCourse();
    loadProgress();
  }, [params.slug]);

  function loadCourse() {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then((data) => {
        // Paid course the student hasn't unlocked — send them to the course
        // page where the purchase/subscribe options live.
        if (data.access_info && !data.access_info.has_access) {
          router.replace(`/courses/${params.slug}`);
          return;
        }
        setCourse(data);
        if (
          !currentLesson &&
          data.modules.length > 0 &&
          data.modules[0].lessons.length > 0
        ) {
          setCurrentLesson(data.modules[0].lessons[0]);
        }
      })
      .catch(console.error);
  }

  function loadProgress() {
    clientFetch<Progress[]>(`/api/v1/courses/${params.slug}/progress/`)
      .then((items) => {
        const map: Record<number, Progress> = {};
        items.forEach((p) => {
          map[p.lesson] = p;
        });
        setProgressMap(map);
      })
      .catch(console.error);
  }

  // Flatten all lessons in order
  const allLessons = useMemo(() => {
    if (!course) return [];
    return course.modules.flatMap((m) => m.lessons);
  }, [course]);

  function handleLessonSelect(lesson: Lesson) {
    setCurrentLesson(lesson);
  }

  function handleProgressUpdate() {
    loadProgress();
  }

  const handleLessonComplete = useCallback(() => {
    if (!autoPlay || !currentLesson) return;
    const idx = allLessons.findIndex((l) => l.id === currentLesson.id);
    if (idx >= 0 && idx < allLessons.length - 1) {
      setTimeout(() => setCurrentLesson(allLessons[idx + 1]), 1500);
    }
  }, [autoPlay, currentLesson, allLessons]);

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (!course) return 0;
    const totalLessons = course.modules.reduce(
      (acc, m) => acc + m.lessons.length,
      0,
    );
    if (totalLessons === 0) return 0;
    const completedCount = Object.values(progressMap).filter(
      (p) => p.completed,
    ).length;
    return Math.round((completedCount / totalLessons) * 100);
  }, [course, progressMap]);

  if (!course || !currentLesson) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-2 w-full" />
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="hidden w-80 space-y-2 lg:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress bar at top */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{course.title}</span>
          <span>{overallProgress}% complete</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          {/* Video */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <VideoPlayer
              courseSlug={params.slug}
              lesson={currentLesson}
              progress={progressMap[currentLesson.id] || null}
              onProgressUpdate={handleProgressUpdate}
              onLessonComplete={handleLessonComplete}
            />
          </div>

          {/* Lesson content */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {currentLesson.title}
            </h1>
            {currentLesson.content_html && (
              <div
                className="prose mt-4 max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: currentLesson.content_html }}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="sticky top-20">
            <LessonSidebar
              course={course}
              currentLessonId={currentLesson.id}
              progressMap={progressMap}
              onLessonSelect={handleLessonSelect}
              autoPlay={autoPlay}
              onAutoPlayChange={setAutoPlay}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
