"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageState } from "@/components/ui/page-state";
import { clientFetch } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";
import { CourseForm } from "@/components/admin/course-form";
import type { CourseDetail } from "@/types/course";

export default function AdminCourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          toast.error("Failed to load course.");
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.slug, reloadKey]);

  // Background refresh after CourseForm saves a module/lesson — updates the
  // header (title, published badge) in place without re-showing the skeleton.
  const refreshCourse = useCallback(() => {
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then(setCourse)
      .catch(console.error);
  }, [params.slug]);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      }
      className="space-y-6"
    >
      {course && (
        <>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/admin/courses">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Edit Course</h1>
              <p className="text-sm text-muted-foreground">{course.title}</p>
            </div>
            <Badge variant={course.is_published ? "success" : "secondary"}>
              {course.is_published ? "Published" : "Draft"}
            </Badge>
          </div>

          <CourseForm course={course} onCourseLoaded={refreshCourse} />
        </>
      )}
    </PageState>
  );
}
