"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Video,
  Mail,
  Newspaper,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Filter,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMonthGridDates, getWeekDates, isSameDay, isToday, toDateKey } from "@/lib/calendar-utils";

export type EventCategory = "all" | "live" | "email" | "blog";

export interface UnifiedCalendarItem {
  id: string;
  title: string;
  category: "live" | "email" | "blog";
  scheduledAt: string; // ISO date string
  status: "scheduled" | "published" | "draft" | "completed";
  subtitle?: string;
  href: string;
}

const CATEGORY_STYLES = {
  live: {
    label: "Live Event",
    bg: "bg-purple-100 dark:bg-purple-950/60",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-800",
    badge: "bg-purple-600 text-white",
    dot: "bg-purple-500",
    icon: Video,
  },
  email: {
    label: "Email Broadcast",
    bg: "bg-blue-100 dark:bg-blue-950/60",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    badge: "bg-blue-600 text-white",
    dot: "bg-blue-500",
    icon: Mail,
  },
  blog: {
    label: "Blog Post",
    bg: "bg-emerald-100 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    badge: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
    icon: Newspaper,
  },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface UnifiedCalendarProps {
  initialItems?: UnifiedCalendarItem[];
}

export function UnifiedCalendar({ initialItems = [] }: UnifiedCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>("all");
  const [selectedItem, setSelectedItem] = useState<UnifiedCalendarItem | null>(null);

  // Mock initial events if empty to give instant visual feedback to coach
  const items = useMemo<UnifiedCalendarItem[]>(() => {
    if (initialItems.length > 0) return initialItems;

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    return [
      {
        id: "live-1",
        title: "Live Pilates Masterclass",
        category: "live",
        scheduledAt: new Date(y, m, d, 18, 0).toISOString(),
        status: "scheduled",
        subtitle: "60 mins • Zoom Room A",
        href: "/admin/live",
      },
      {
        id: "email-1",
        title: "Weekly Motivation Newsletter",
        category: "email",
        scheduledAt: new Date(y, m, d + 2, 9, 0).toISOString(),
        status: "scheduled",
        subtitle: "Recipients: All Active Students (342)",
        href: "/admin/email",
      },
      {
        id: "blog-1",
        title: "5 Tips for Posture Alignment",
        category: "blog",
        scheduledAt: new Date(y, m, d + 4, 14, 0).toISOString(),
        status: "published",
        subtitle: "SEO Keywords: Pilates, Health",
        href: "/admin/blog",
      },
      {
        id: "live-2",
        title: "Sunset Breathwork & Q&A",
        category: "live",
        scheduledAt: new Date(y, m, d + 7, 19, 30).toISOString(),
        status: "scheduled",
        subtitle: "Interactive Workshop",
        href: "/admin/live",
      },
      {
        id: "email-2",
        title: "New Course Announcement",
        category: "email",
        scheduledAt: new Date(y, m, d + 10, 10, 0).toISOString(),
        status: "draft",
        subtitle: "Draft Campaign",
        href: "/admin/email",
      },
    ];
  }, [initialItems]);

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (selectedCategory === "all") return items;
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Calendar dates calculation
  const gridDates = useMemo(() => {
    if (viewMode === "month") {
      return getMonthGridDates(currentDate.getFullYear(), currentDate.getMonth());
    }
    return getWeekDates(currentDate);
  }, [currentDate, viewMode]);

  // Group events by date key
  const eventsByDateKey = useMemo(() => {
    const map: Record<string, UnifiedCalendarItem[]> = {};
    for (const item of filteredItems) {
      const key = toDateKey(new Date(item.scheduledAt));
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [filteredItems]);

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Unified Content Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule and manage Live Events, Email Broadcasts, and Blog Posts in one place.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Create Dropdown buttons */}
          <Button asChild size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm">
            <Link href="/admin/live">
              <Plus className="h-4 w-4" />
              Live Event
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            <Link href="/admin/email/compose">
              <Plus className="h-4 w-4" />
              Broadcast Email
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <Link href="/admin/blog">
              <Plus className="h-4 w-4" />
              Blog Article
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter and View Mode Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/40 p-3 rounded-xl border">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            All Items ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("live")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === "live"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-background text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            Live Events
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("email")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === "email"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-background text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Email Broadcasts
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("blog")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === "blog"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-background text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Blog Posts
          </button>
        </div>

        {/* View Mode & Date Nav */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="flex items-center border rounded-lg overflow-hidden bg-background">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Month Year Title */}
      <div className="text-lg font-bold tracking-tight text-foreground">
        {monthLabel}
      </div>

      {/* Grid View */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b bg-muted/60 text-center text-xs font-semibold text-muted-foreground py-2.5">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Date Grid */}
        <div
          className={`grid grid-cols-7 divide-x divide-y divide-border/60 ${
            viewMode === "month" ? "auto-rows-[120px]" : "auto-rows-[220px]"
          }`}
        >
          {gridDates.map((date) => {
            const key = toDateKey(date);
            const dayEvents = eventsByDateKey[key] || [];
            const isCurrentMonth = date.getMonth() === currentDate.getMonth();
            const today = isToday(date);

            return (
              <div
                key={key}
                className={`p-1.5 flex flex-col transition-colors ${
                  !isCurrentMonth ? "bg-muted/20 opacity-50" : "bg-card"
                } ${today ? "bg-primary/5 font-semibold" : ""}`}
              >
                {/* Date header inside cell */}
                <div className="flex items-center justify-between px-1 mb-1">
                  <span
                    className={`inline-flex items-center justify-center text-xs h-5 w-5 rounded-full ${
                      today ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {dayEvents.length} item{dayEvents.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Event Badges List */}
                <div className="flex-1 overflow-y-auto space-y-1 p-0.5">
                  {dayEvents.map((item) => {
                    const style = CATEGORY_STYLES[item.category];
                    const Icon = style.icon;
                    const eventTime = new Date(item.scheduledAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className={`w-full text-left p-1.5 rounded-md border text-xs transition-all hover:scale-[1.02] ${style.bg} ${style.border} ${style.text}`}
                      >
                        <div className="flex items-center gap-1.5 font-medium truncate">
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] opacity-80 mt-0.5">
                          <span>{eventTime}</span>
                          <span className="uppercase font-mono text-[9px]">{item.status}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Event Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <Badge className={CATEGORY_STYLES[selectedItem.category].badge}>
                  {CATEGORY_STYLES[selectedItem.category].label}
                </Badge>
                <h3 className="text-lg font-bold mt-2 leading-tight">
                  {selectedItem.title}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={() => setSelectedItem(null)}
              >
                ✕
              </Button>
            </div>

            {/* Event Details */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {new Date(selectedItem.scheduledAt).toLocaleString("default", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {selectedItem.subtitle && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <span>{selectedItem.subtitle}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="capitalize font-mono text-xs">
                  {selectedItem.status}
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
                Close
              </Button>
              <Button asChild size="sm" className="gap-1.5">
                <Link href={selectedItem.href}>
                  <span>Manage {CATEGORY_STYLES[selectedItem.category].label}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
