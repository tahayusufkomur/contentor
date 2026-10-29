"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { clientFetch } from "@/lib/api-client";
import type { RecipientFilter } from "@/lib/email-api";
import { Skeleton } from "@/components/ui/skeleton";

interface Course {
  id: number;
  title: string;
  slug: string;
}

interface Student {
  id: number;
  name: string;
  email: string;
}

interface RecipientSelectorProps {
  value: RecipientFilter;
  onChange: (filter: RecipientFilter) => void;
  recipientCount: number | null;
  onCountChange: (count: number | null) => void;
}

export function RecipientSelector({
  value,
  onChange,
  recipientCount,
  onCountChange,
}: RecipientSelectorProps) {
  const tr = useTranslations("admin.email.recipients");
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [loadingCount, setLoadingCount] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);

    Promise.all([
      clientFetch<{ results: Course[] } | Course[]>(
        "/api/v1/courses/?limit=100",
      )
        .then((data) => (Array.isArray(data) ? data : data.results || []))
        .catch(() => [] as Course[]),
      clientFetch<{ results: Student[] } | Student[]>(
        "/api/v1/auth/students/?limit=100",
      )
        .then((data) => (Array.isArray(data) ? data : data.results || []))
        .catch(() => [] as Student[]),
    ]).then(([courseData, studentData]) => {
      if (cancelled) return;
      setCourses(courseData);
      setStudents(studentData);
      setLoadingOptions(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The server counts who the email reaches now: students who unsubscribed are left out.
  useEffect(() => {
    onCountChange(null);
    const empty =
      (value.type === "course" && value.course_ids.length === 0) ||
      (value.type === "individual" && value.user_ids.length === 0);
    if (empty) {
      onCountChange(0);
      return;
    }
    let cancelled = false;
    setLoadingCount(true);
    const timer = window.setTimeout(() => {
      clientFetch<{ count: number }>("/api/v1/email/recipients/count/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_filter: value }),
      })
        .then(({ count }) => !cancelled && onCountChange(count))
        .catch(() => !cancelled && onCountChange(null))
        .finally(() => !cancelled && setLoadingCount(false));
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onCountChange, value]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(q) ||
        student.email.toLowerCase().includes(q),
    );
  }, [studentSearch, students]);

  const filterType = value.type;

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">{tr("title")}</label>

      <div className="flex flex-wrap gap-4">
        {(["all", "course", "individual"] as const).map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="recipient_type"
              checked={filterType === type}
              onChange={() => {
                if (type === "all") onChange({ type: "all" });
                if (type === "course")
                  onChange({ type: "course", course_ids: [] });
                if (type === "individual")
                  onChange({ type: "individual", user_ids: [] });
              }}
              className="accent-primary"
            />
            <span className="text-sm">{tr(type)}</span>
          </label>
        ))}
      </div>

      {filterType === "course" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            {tr("selectCourses")}
          </label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {loadingOptions ? (
              <div className="space-y-1.5 p-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full rounded" />
                ))}
              </div>
            ) : (
              <>
                {courses.map((course) => {
                  const selected =
                    value.type === "course" &&
                    value.course_ids.includes(course.id);
                  return (
                    <label
                      key={course.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          if (value.type !== "course") return;
                          const nextIds = selected
                            ? value.course_ids.filter((id) => id !== course.id)
                            : [...value.course_ids, course.id];
                          onChange({ type: "course", course_ids: nextIds });
                        }}
                        className="accent-primary"
                      />
                      <span className="text-sm">{course.title}</span>
                    </label>
                  );
                })}
                {courses.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">
                    {tr("noCourses")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {filterType === "individual" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder={tr("searchStudents")}
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {loadingOptions ? (
              <div className="space-y-1.5 p-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full rounded" />
                ))}
              </div>
            ) : (
              <>
                {filteredStudents.map((student) => {
                  const selected =
                    value.type === "individual" &&
                    value.user_ids.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          if (value.type !== "individual") return;
                          const nextIds = selected
                            ? value.user_ids.filter((id) => id !== student.id)
                            : [...value.user_ids, student.id];
                          onChange({ type: "individual", user_ids: nextIds });
                        }}
                        className="accent-primary"
                      />
                      <span className="text-sm">
                        {student.name || student.email}
                      </span>
                      {student.name && (
                        <span className="text-xs text-muted-foreground">
                          {student.email}
                        </span>
                      )}
                    </label>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">
                    {tr("noStudents")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {loadingCount
          ? tr("counting")
          : recipientCount !== null
            ? tr("count", { count: recipientCount })
            : filterType === "all"
              ? tr("allActive")
              : tr("selectAbove")}
      </div>
    </div>
  );
}
