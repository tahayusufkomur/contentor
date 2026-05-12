import { Plus, Users, DollarSign, BookOpen, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "Students", value: "142", Icon: Users },
  { label: "Revenue", value: "$2.4k", Icon: DollarSign },
  { label: "Courses", value: "8", Icon: BookOpen },
  { label: "Completion", value: "96%", Icon: TrendingUp },
];

const courses = [
  { name: "Introduction to Yoga", lessons: 12, status: "Published" },
  { name: "Advanced Meditation", lessons: 9, status: "Draft" },
  { name: "Breathwork Basics", lessons: 6, status: "Draft" },
] as const;

export function ProductMockup() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-32">
      {/* Glow under the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-8 h-56 rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] via-[oklch(0.6_0.22_260)] to-[oklch(0.7_0.2_210)] opacity-25 blur-3xl"
      />

      <div className="relative">
        <div className="glass-pane overflow-hidden">
          {/* Window chrome */}
          <div className="flex items-center gap-3 border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[#FF5F57]/80" />
              <div className="h-3 w-3 rounded-full bg-[#FEBC2E]/80" />
              <div className="h-3 w-3 rounded-full bg-[#28C840]/80" />
            </div>
            <div className="ml-2 inline-flex items-center gap-2 rounded-full bg-foreground/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              your-brand.contentor.app
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[220px_1fr]">
            {/* Sidebar */}
            <aside className="hidden flex-col gap-2 border-r border-border/40 p-5 md:flex">
              <div className="text-eyebrow text-muted-foreground/80">Studio</div>
              {["Dashboard", "Courses", "Students", "Live", "Email", "Settings"].map(
                (label, i) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] ${
                      i === 0
                        ? "bg-foreground/[0.06] font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                    {label}
                  </div>
                ),
              )}
            </aside>

            {/* Main */}
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-eyebrow text-muted-foreground/70">Overview</p>
                  <h3 className="text-headline mt-1 text-2xl">Good morning, Sarah</h3>
                </div>
                <Button variant="brand" size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Course
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                {stats.map(({ label, value, Icon }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border/50 bg-background/40 p-4 backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {label}
                      </p>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </div>
                    <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-border/50">
                {courses.map((course, i) => (
                  <div
                    key={course.name}
                    className={`flex items-center justify-between px-5 py-4 ${
                      i !== courses.length - 1
                        ? "border-b border-border/40"
                        : ""
                    }`}
                  >
                    <div>
                      <p className="text-[14px] font-medium">{course.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {course.lessons} lessons
                      </p>
                    </div>
                    <Badge
                      variant={course.status === "Published" ? "success" : "outline"}
                    >
                      {course.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
