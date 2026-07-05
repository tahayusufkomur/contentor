"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  CourseCard,
  type CourseCardVariant,
} from "@/components/public/course-card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FacetPills,
  buildFacets,
  matchesFacets,
  type FacetSelection,
} from "@/components/public/facet-pills";
import { Search, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";

type Filter = "all" | "free" | "paid" | "accessible";

const COLUMN_CLASSES: Record<number, string> = {
  2: "grid gap-4 sm:grid-cols-2",
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
};

interface CourseCatalogClientProps {
  courses: Course[];
  columns?: number;
  showFilters?: boolean;
  cardStyle?: CourseCardVariant;
  showPrice?: boolean;
  showMeta?: boolean;
  /** FilterGroup ids the coach chose to expose as facets on this block. */
  filterGroupIds?: number[];
}

export function CourseCatalogClient({
  courses,
  columns = 3,
  showFilters = true,
  cardStyle = "elevated",
  showPrice = true,
  showMeta = true,
  filterGroupIds = [],
}: CourseCatalogClientProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [facetSel, setFacetSel] = useState<FacetSelection>({});

  const facets = useMemo(
    () => buildFacets(courses, filterGroupIds),
    [courses, filterGroupIds],
  );

  const filtered = useMemo(() => {
    let result = courses;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.instructor_name?.toLowerCase().includes(q),
      );
    }
    if (filter === "free")
      result = result.filter((c) => c.pricing_type === "free");
    if (filter === "paid")
      result = result.filter((c) => c.pricing_type !== "free");
    if (filter === "accessible")
      result = result.filter((c) => c.access_info?.has_access);
    result = result.filter((c) => matchesFacets(c, facetSel));
    return result;
  }, [courses, search, filter, facetSel]);

  const hasAccessible = courses.some(
    (c) => c.access_info?.has_access && c.pricing_type !== "free",
  );

  const filters: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Free", value: "free" },
    { label: "Paid", value: "paid" },
    ...(hasAccessible
      ? [{ label: "My Courses", value: "accessible" as Filter }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search courses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    filter === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Coach-curated filter facets */}
          <FacetPills
            facets={facets}
            selected={facetSel}
            onChange={setFacetSel}
          />
        </div>
      )}

      {/* Course grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          description={
            search.trim()
              ? "Try adjusting your search or filters."
              : "No courses available yet. Check back soon!"
          }
        />
      ) : (
        <div className={COLUMN_CLASSES[columns] ?? COLUMN_CLASSES[3]}>
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              variant={cardStyle}
              showPrice={showPrice}
              showMeta={showMeta}
            />
          ))}
        </div>
      )}
    </div>
  );
}
