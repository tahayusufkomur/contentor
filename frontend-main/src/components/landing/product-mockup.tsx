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
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-1.5">
            <div className="size-3 rounded-full bg-muted-foreground/30" />
            <div className="size-3 rounded-full bg-muted-foreground/30" />
            <div className="size-3 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="ml-2 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-marketing-accent" />
            your-brand.contentor.app
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="hidden flex-col gap-1 border-r bg-sidebar p-5 md:flex">
            <div className="text-eyebrow mb-2 text-muted-foreground">
              Studio
            </div>
            {[
              "Dashboard",
              "Courses",
              "Students",
              "Live",
              "Email",
              "Settings",
            ].map((label, i) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  i === 0
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                {label}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-eyebrow text-muted-foreground">Overview</p>
                <h3 className="text-headline mt-1 text-2xl text-foreground">
                  Good morning, Sarah
                </h3>
              </div>
              <Button size="sm">
                <Plus />
                New Course
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map(({ label, value, Icon }) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {label}
                    </p>
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border">
              {courses.map((course, i) => (
                <div
                  key={course.name}
                  className={`flex items-center justify-between px-5 py-4 ${
                    i !== courses.length - 1 ? "border-b" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{course.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {course.lessons} lessons
                    </p>
                  </div>
                  <Badge
                    variant={
                      course.status === "Published" ? "success" : "outline"
                    }
                  >
                    {course.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
