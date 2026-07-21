import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Users, Mail, Receipt, Smartphone, Globe, UserCheck, ShieldAlert, Sparkles, ChevronRight } from "lucide-react";
import { TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";
import { StudentDrawer, type StudentDetail } from "@/components/admin/students/student-drawer";

export const dynamic = "force-dynamic";

interface Student {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  date_joined: string;
  last_login: string | null;
  enrolled_count: number;
  last_display_mode?: string;
  last_platform?: string;
  progress_percent?: number;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SORT_OPTIONS = [
  { label: "Newest", value: "-date_joined" },
  { label: "Oldest", value: "date_joined" },
  { label: "Name A-Z", value: "name" },
  { label: "Name Z-A", value: "-name" },
];

export default function StudentsPage() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<"all" | "active" | "at_risk" | "new">("all");

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Student>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      const data = await clientFetch<
        { results: Student[]; next: string | null; count: number } | Student[]
      >(`/api/v1/auth/students/?${sp.toString()}`);

      let list = Array.isArray(data) ? data : data.results;
      const count = Array.isArray(data) ? data.length : data.count;
      const next = Array.isArray(data) ? null : data.next;

      // Use overall_progress returned from Django backend
      list = list.map((s) => ({
        ...s,
        progress_percent: s.overall_progress ?? 0,
      }));

      return { results: list, next, count };
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student CRM & Engagement</h1>
          <p className="text-sm text-muted-foreground">
            Manage student enrollments, course progress, direct actions, and retention.
          </p>
        </div>
      </div>

      {/* CRM Quick Filter Tabs */}
      <div className="flex items-center gap-2 border-b pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveFilterTab("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            activeFilterTab === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          All Students
        </button>

        <button
          type="button"
          onClick={() => setActiveFilterTab("active")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            activeFilterTab === "active"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-muted/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Active Subscribers
        </button>

        <button
          type="button"
          onClick={() => setActiveFilterTab("at_risk")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            activeFilterTab === "at_risk"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-muted/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          At-Risk / Inactive
        </button>

        <button
          type="button"
          onClick={() => setActiveFilterTab("new")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
            activeFilterTab === "new"
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-muted/50 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          New This Week
        </button>
      </div>

      <MediaBrowser<Student>
        ref={browserRef}
        persistKey="students"
        fetchPage={fetchPage}
        sortOptions={SORT_OPTIONS}
        defaultSort="-date_joined"
        galleryEnabled={false}
        emptyIcon={Users}
        emptyMessage="No students found."
        getItemId={(s) => s.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/auth/students/${id}/`, {
                  method: "DELETE",
                }),
            ),
          );
          toast.success("Students deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Student", key: "student" },
          { label: "Enrolled Courses", key: "enrolled" },
          { label: "Course Progress", key: "progress" },
          { label: "Joined", key: "joined" },
          { label: "Last Active", key: "active" },
          { label: "Actions", key: "actions" },
        ]}
        renderListRow={(student) => (
          <>
            <TableCell
              className="cursor-pointer hover:bg-accent/40"
              onClick={() => setSelectedStudent(student)}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-primary/20">
                  <AvatarImage src={student.avatar_url} />
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {getInitials(student.name || student.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {student.name || "Unnamed"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {student.email}
                  </p>
                  {student.last_display_mode && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground mt-0.5">
                      {student.last_display_mode === "pwa" ? (
                        <Smartphone className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {student.last_display_mode === "pwa" ? "PWA" : "Web"}
                      {student.last_platform
                        ? ` · ${student.last_platform}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            </TableCell>

            <TableCell
              className="cursor-pointer"
              onClick={() => setSelectedStudent(student)}
            >
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {student.enrolled_count}{" "}
                {student.enrolled_count === 1 ? "course" : "courses"}
              </span>
            </TableCell>

            {/* Course Progress Column */}
            <TableCell
              className="cursor-pointer min-w-[140px]"
              onClick={() => setSelectedStudent(student)}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] font-semibold">
                    {student.progress_percent || 0}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">overall</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{ width: `${student.progress_percent || 0}%` }}
                  />
                </div>
              </div>
            </TableCell>

            <TableCell className="text-muted-foreground text-xs">
              {formatDate(student.date_joined)}
            </TableCell>

            <TableCell className="text-muted-foreground text-xs">
              {student.last_login ? formatDate(student.last_login) : "Never"}
            </TableCell>

            <TableCell>
              <button
                type="button"
                onClick={() => setSelectedStudent(student)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span>Manage</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </TableCell>
          </>
        )}
      />

      {/* Student CRM Slide-Over Drawer */}
      <StudentDrawer
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onRefresh={() => browserRef.current?.refresh()}
      />
    </div>
  );
}
