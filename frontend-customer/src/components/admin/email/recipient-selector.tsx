"use client";

import { useEffect, useMemo, useState } from "react";

import { clientFetch } from "@/lib/api-client";
import type { RecipientFilter } from "@/lib/email-api";

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
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    clientFetch<{ results: Course[] } | Course[]>("/api/v1/courses/?limit=100")
      .then((data) => {
        if (Array.isArray(data)) {
          setCourses(data);
        } else {
          setCourses(data.results || []);
        }
      })
      .catch(() => {
        setCourses([]);
      });

    clientFetch<{ results: Student[] } | Student[]>("/api/v1/auth/students/?limit=100")
      .then((data) => {
        if (Array.isArray(data)) {
          setStudents(data);
        } else {
          setStudents(data.results || []);
        }
      })
      .catch(() => {
        setStudents([]);
      });
  }, []);

  useEffect(() => {
    onCountChange(null);
    setLoadingCount(true);

    const timer = window.setTimeout(() => {
      if (value.type === "all") {
        onCountChange(students.length);
      } else if (value.type === "individual") {
        onCountChange(value.user_ids.length);
      } else {
        onCountChange(null);
      }
      setLoadingCount(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [onCountChange, students.length, value]);

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
      <label className="text-sm font-medium">Recipients</label>

      <div className="flex flex-wrap gap-4">
        {(["all", "course", "individual"] as const).map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="recipient_type"
              checked={filterType === type}
              onChange={() => {
                if (type === "all") onChange({ type: "all" });
                if (type === "course") onChange({ type: "course", course_ids: [] });
                if (type === "individual") onChange({ type: "individual", user_ids: [] });
              }}
              className="accent-primary"
            />
            <span className="text-sm">
              {type === "all"
                ? "All students"
                : type === "course"
                  ? "By course"
                  : "Individual students"}
            </span>
          </label>
        ))}
      </div>

      {filterType === "course" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Select courses</label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {courses.map((course) => {
              const selected =
                value.type === "course" && value.course_ids.includes(course.id);
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
              <p className="p-2 text-xs text-muted-foreground">No courses found.</p>
            )}
          </div>
        </div>
      )}

      {filterType === "individual" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search students..."
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredStudents.map((student) => {
              const selected =
                value.type === "individual" && value.user_ids.includes(student.id);
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
                  <span className="text-sm">{student.name || student.email}</span>
                  {student.name && (
                    <span className="text-xs text-muted-foreground">{student.email}</span>
                  )}
                </label>
              );
            })}
            {filteredStudents.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">No students found.</p>
            )}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {loadingCount
          ? "Counting recipients..."
          : recipientCount !== null
            ? `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`
            : filterType === "all"
              ? "All active students"
              : "Select recipients above"}
      </div>
    </div>
  );
}
