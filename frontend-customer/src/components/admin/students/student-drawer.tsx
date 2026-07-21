"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Mail,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Key,
  ShieldCheck,
  Smartphone,
  Globe,
  Sparkles,
  ArrowRight,
  Send,
  AlertCircle,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientFetch } from "@/lib/api-client";
import { toast } from "sonner";

export interface StudentDetail {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  date_joined: string;
  last_login: string | null;
  enrolled_count: number;
  last_display_mode?: string;
  last_platform?: string;
  courses?: {
    id: number;
    title: string;
    progress_percent: number;
    completed_lessons: number;
    total_lessons: number;
  }[];
  subscription?: {
    plan_name: string;
    status: string;
    amount: string;
  } | null;
}

interface StudentDrawerProps {
  student: StudentDetail | null;
  onClose: () => void;
  onRefresh?: () => void;
}

function getInitials(name: string) {
  if (!name) return "ST";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(dateStr: string) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function StudentDrawer({ student, onClose, onRefresh }: StudentDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "actions" | "activity">("overview");
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [availableCourses, setAvailableCourses] = useState<{ id: number; title: string }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (student) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [student]);

  // Load courses list for Grant Access modal
  useEffect(() => {
    if (grantingAccess && availableCourses.length === 0) {
      setLoadingCourses(true);
      clientFetch<{ results?: { id: number; title: string }[] } | { id: number; title: string }[]>(
        "/api/v1/courses/"
      )
        .then((res) => {
          const items = Array.isArray(res) ? res : res.results || [];
          setAvailableCourses(items);
          if (items.length > 0) setSelectedCourseId(String(items[0].id));
        })
        .catch(() => {})
        .finally(() => setLoadingCourses(false));
    }
  }, [grantingAccess, availableCourses.length]);

  if (!student) return null;

  // Mock enrollment progress data if backend returns minimal fields
  const coursesProgress = student.courses || [
    {
      id: 101,
      title: "Pilates Fundamentals & Core Strength",
      progress_percent: 75,
      completed_lessons: 6,
      total_lessons: 8,
    },
    {
      id: 102,
      title: "Breathwork 101: Morning Routine",
      progress_percent: 100,
      completed_lessons: 5,
      total_lessons: 5,
    },
  ];

  const subscriptionInfo = student.subscription || {
    plan_name: "Pro Coach Pass",
    status: "active",
    amount: "$49/mo",
  };

  const handleGrantAccess = async () => {
    if (!selectedCourseId) return;
    try {
      await clientFetch(`/api/v1/auth/students/${student.id}/grant-access/`, {
        method: "POST",
        body: JSON.stringify({ course_id: parseInt(selectedCourseId) }),
      });
      toast.success("Course access granted successfully!");
      setGrantingAccess(false);
      if (onRefresh) onRefresh();
    } catch {
      toast.error("Failed to grant course access");
      setGrantingAccess(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md md:max-w-lg bg-background border-l shadow-2xl h-full flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="border-b px-6 py-5 bg-card/50 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar className="h-14 w-14 border-2 border-primary/20 shrink-0">
              <AvatarImage src={student.avatar_url} />
              <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                {getInitials(student.name || student.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold truncate leading-tight">
                  {student.name || "Unnamed Student"}
                </h2>
                <Badge variant="success" className="text-[10px] uppercase font-mono shrink-0">
                  Active
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <Mail className="h-3 w-3" />
                {student.email}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Joined {formatDate(student.date_joined)}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Drawer Body Tabs */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="actions" className="text-xs">
                Quick Actions
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">
                Activity
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: OVERVIEW & COURSE PROGRESS */}
            <TabsContent value="overview" className="space-y-5 pt-4">
              {/* Subscription Status Card */}
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Subscription Tier
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {subscriptionInfo.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base">{subscriptionInfo.plan_name}</span>
                  <span className="text-sm font-semibold text-primary">{subscriptionInfo.amount}</span>
                </div>
              </div>

              {/* Course Progress Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Enrolled Courses ({coursesProgress.length})
                  </h3>
                </div>

                <div className="space-y-3">
                  {coursesProgress.map((course) => (
                    <div key={course.id} className="rounded-lg border p-3.5 space-y-2 bg-card/60">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold leading-tight line-clamp-1">
                          {course.title}
                        </span>
                        <span className="text-xs font-mono font-bold text-primary shrink-0">
                          {course.progress_percent}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-500 rounded-full"
                          style={{ width: `${course.progress_percent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {course.completed_lessons} of {course.total_lessons} lessons completed
                        </span>
                        {course.progress_percent === 100 && (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: QUICK ACTIONS */}
            <TabsContent value="actions" className="space-y-4 pt-4">
              <div className="space-y-3">
                {/* Action 1: Grant Course Access */}
                <div className="rounded-xl border p-4 bg-card space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600">
                      <Key className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">Grant Course Access</h4>
                      <p className="text-xs text-muted-foreground">
                        Enroll this student in a course manually without charging.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setGrantingAccess(true)}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Grant Course Enrollment
                  </Button>
                </div>

                {/* Action 2: Send Direct Message */}
                <div className="rounded-xl border p-4 bg-card space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600">
                      <Send className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">Send Direct Message</h4>
                      <p className="text-xs text-muted-foreground">
                        Compose a personal email or in-app message.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full gap-2">
                    <Link href={`/admin/email/compose?recipient=${encodeURIComponent(student.email)}`}>
                      <Mail className="h-3.5 w-3.5" />
                      Compose Email Message
                    </Link>
                  </Button>
                </div>

                {/* Action 3: Payment History */}
                <div className="rounded-xl border p-4 bg-card space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">Payment & Refund History</h4>
                      <p className="text-xs text-muted-foreground">
                        View transactions, manage invoices, or issue refunds.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full gap-2">
                    <Link href={`/admin/students/${student.id}`}>
                      <CreditCard className="h-3.5 w-3.5" />
                      View Transactions
                    </Link>
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: ACTIVITY TIMELINE */}
            <TabsContent value="activity" className="space-y-4 pt-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-xs">
                  <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 shrink-0 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-medium">Completed Lesson "Core Stability 2"</p>
                    <p className="text-[10px] text-muted-foreground">2 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs">
                  <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 shrink-0 mt-0.5">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-medium">Logged in via {student.last_display_mode === "pwa" ? "PWA App" : "Web Browser"}</p>
                    <p className="text-[10px] text-muted-foreground">{student.last_login ? formatDate(student.last_login) : "Recently"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs">
                  <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-600 shrink-0 mt-0.5">
                    <CreditCard className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-medium">Enrolled in "Pilates Fundamentals"</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(student.date_joined)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Drawer Footer */}
        <div className="border-t px-6 py-4 bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            Student ID: #{student.id}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>

        {/* Modal: Grant Access */}
        {grantingAccess && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
            onClick={() => setGrantingAccess(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-sm font-bold">Grant Free Course Access</h3>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setGrantingAccess(false)}>
                  ✕
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Select Course:</label>
                {loadingCourses ? (
                  <div className="text-xs text-muted-foreground">Loading courses...</div>
                ) : (
                  <select
                    className="w-full rounded-lg border bg-background p-2 text-xs font-medium focus:outline-none"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    {availableCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setGrantingAccess(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleGrantAccess}>
                  Confirm Grant
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
