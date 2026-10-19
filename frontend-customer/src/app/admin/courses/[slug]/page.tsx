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
import { startActiveTime } from "@/lib/focus/active-time";
import { fetchCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import {
  activeCreation,
  openCreationFor,
  setActiveCreation,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import { useAssistantApplied } from "@/lib/site-events";
import { useNavigate } from "@shared/navigation/navigation-provider";
import type { CourseDetail } from "@/types/course";

/** What the assistant can do to a course that the open form would not know. */
const COURSE_CHANGES = new Set([
  "create_course",
  "edit_course",
  "edit_curriculum",
  "set_course_cover",
  "publish_course",
]);

export default function AdminCourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const navigate = useNavigate();

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

  // Focus mode: a course she is still making in it reopens there, where she
  // stopped; the guide and this form follow the creation from here.
  const overview = useFocusOverview();
  const active = useActiveCreation();
  const courseId = course?.id;
  const creationId =
    courseId === undefined
      ? null
      : (openCreationFor(overview, "course", courseId) ??
        (active?.record?.id === courseId ? active.id : null));
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("course"));
    // Just made from the new-course page: the guide already holds it.
    if (activeCreation()?.id === creationId) return;
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  const focusing =
    !!course && !!active && active.id !== 0 && active.record?.id === course.id;
  const outline = active?.outline;
  const descriptions = active?.descriptions;
  const focus = focusing
    ? {
        record: `course:${course.id}`,
        // A run that failed or was stopped is not replayed: the guide offers
        // Try again and the form shows what is saved.
        runId:
          outline?.status === "building" || outline?.status === "ready"
            ? outline.run
            : null,
        // Any run that exists, even a stopped or failed one: the replay must
        // end so what it wrote is loaded onto the page.
        descriptionsRunId: descriptions?.run ?? null,
      }
    : undefined;

  // The assistant changed this course (its curriculum, text, price or cover):
  // load it again and hand the form the new copy. The form keeps its own
  // state, so it is remounted — only for a change to the course on screen.
  useAssistantApplied((applied) => {
    // An undo counts like the change it takes back; undoing the course's own
    // creation deletes it, so the reload fails and she goes back to the list.
    const kind = applied.kind.replace(/^undo:/, "");
    if (applied.id !== course?.id || !COURSE_CHANGES.has(kind)) return;
    clientFetch<CourseDetail>(`/api/v1/courses/${params.slug}/`)
      .then((data) => {
        setCourse(data);
        setFormKey((k) => k + 1);
      })
      .catch(() => navigate("/admin/courses"));
  });

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
          {!focusing && (
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon">
                <Link href="/admin/courses">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold tracking-tight">
                  Edit Course
                </h1>
                <p className="text-sm text-muted-foreground">{course.title}</p>
              </div>
              <Badge variant={course.is_published ? "success" : "secondary"}>
                {course.is_published ? "Published" : "Draft"}
              </Badge>
            </div>
          )}

          <CourseForm
            key={formKey}
            course={course}
            onCourseLoaded={refreshCourse}
            focus={focus}
          />
        </>
      )}
    </PageState>
  );
}
