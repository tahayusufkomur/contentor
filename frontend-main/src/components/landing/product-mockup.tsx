import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const stats = [
  { label: "Students", value: "142" },
  { label: "Revenue", value: "$2.4k" },
  { label: "Courses", value: "8" },
  { label: "Completion", value: "96%" },
];

const courses = [
  { name: "Introduction to Yoga", lessons: 12, status: "Published" },
  { name: "Advanced Meditation", lessons: 9, status: "Draft" },
  { name: "Breathwork Basics", lessons: 6, status: "Draft" },
] as const;

export function ProductMockup() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-32">
      <div className="-rotate-1">
        <div className="rounded-xl bg-background shadow-2xl shadow-primary/8">
          {/* Browser chrome bar */}
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400/60" />
              <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
              <div className="h-3 w-3 rounded-full bg-green-400/60" />
            </div>
            <div className="ml-3 flex-1 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
              your-brand.contentor.app
            </div>
          </div>

          {/* Dashboard content */}
          <div className="p-6">
            {/* Header row */}
            <div className="mb-6 flex items-center justify-between">
              <div className="h-7 w-48 rounded-md bg-muted" />
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                New Course
              </Button>
            </div>

            {/* Stat cards */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border bg-card p-4 text-card-foreground"
                >
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Course list */}
            <div className="divide-y rounded-lg border">
              {courses.map((course) => (
                <div
                  key={course.name}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{course.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {course.lessons} lessons
                    </p>
                  </div>
                  <Badge
                    variant={
                      course.status === "Published" ? "default" : "secondary"
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
