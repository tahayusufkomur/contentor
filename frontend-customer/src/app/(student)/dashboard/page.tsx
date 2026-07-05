"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import { BookOpen, GraduationCap, Play } from "lucide-react";
import type { Course } from "@/types/course";

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientFetch<Course[]>("/api/v1/courses/enrolled/")
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-44 w-full" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">My Courses</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/orders">Orders</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/subscriptions">My subscriptions</Link>
          </Button>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="You have not enrolled in any courses yet. Browse our catalog to find something interesting."
          action={{ label: "Browse Courses", href: "/courses" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            // If the API returns progress info, we can use it. Otherwise default to 0.
            const progressPercent = (course as any).progress_percent ?? 0;
            const viaSubscription = Boolean((course as any).via_subscription);

            return (
              <Card
                key={course.id}
                className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                {course.thumbnail_url ? (
                  <div className="relative overflow-hidden">
                    <img
                      src={course.thumbnail_signed_url || course.thumbnail_url}
                      alt={course.title}
                      className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <span className="text-5xl font-bold text-primary/30">
                      {course.title.charAt(0)}
                    </span>
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug">
                      {course.title}
                    </h3>
                    {viaSubscription && (
                      <Badge variant="secondary">In your plan</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {course.instructor_name}
                  </p>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <Button asChild size="sm" className="w-full gap-2">
                    <Link href={`/learn/${course.slug}`}>
                      <Play className="h-3.5 w-3.5" />
                      Continue Learning
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
