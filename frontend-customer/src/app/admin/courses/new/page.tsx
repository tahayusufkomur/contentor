"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CourseForm } from "@/components/admin/course-form";
import { DescribeIt } from "@/components/admin/describe-it";
import { FocusStart } from "@/components/focus/focus-start";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { startActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import { postFormTiming } from "@/lib/focus/api";
import { clearActiveCreation, useFocusOverview } from "@/lib/focus/store";
import { useNavigate } from "@shared/navigation/navigation-provider";

const FORM_TIME_KEY = "form:new-course";

export default function NewCoursePage() {
  const overview = useFocusOverview();
  const plain = useSearchParams().get("form") === "1";
  const first = overview?.first.course;
  return (
    <PageState
      loading={overview === null}
      skeleton={<Skeleton className="h-8 w-48" />}
    >
      {overview?.enabled && first && !plain ? (
        <FocusStart kind="course" question={first} />
      ) : (
        <PlainNewCourse focusOn={!!overview?.enabled} />
      )}
    </PageState>
  );
}

/** Today's form. With focus mode on it is "Fill it in myself": no Describe
 *  it (focus mode replaces it), and her time to the create click is stamped
 *  for the comparison with focus mode. */
function PlainNewCourse({ focusOn }: { focusOn: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    clearActiveCreation(0); // from the focus screen's "Fill it in myself"
    if (focusOn) startActiveTime(FORM_TIME_KEY, true);
  }, [focusOn]);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/courses">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New Course</h1>
      </div>

      {!focusOn && (
        <DescribeIt
          kind="course"
          onApplied={(result) => result.url && navigate(result.url)}
        />
      )}

      <CourseForm
        onCreated={(course) => {
          if (focusOn)
            void postFormTiming(
              "course",
              course.id,
              takeActiveMs(FORM_TIME_KEY),
            ).catch(() => {});
        }}
      />
    </div>
  );
}
