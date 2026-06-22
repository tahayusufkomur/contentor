"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileText,
  BookOpen,
  CalendarDays,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clientFetch } from "@/lib/api-client";
import { ModalPortal } from "@/components/ui/modal-portal";
import type { Course } from "@/types/course";
import type { CalendarEvent } from "@/types/live";

interface LinkTarget {
  label: string;
  href: string;
  sub?: string;
}

type Tab = "pages" | "courses" | "events" | "custom";

// Standard site pages a coach can link to. (`pricing` lives at /plans.)
const PAGE_TARGETS: LinkTarget[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Courses", href: "/courses" },
  { label: "Pricing / Plans", href: "/plans" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Calendar", href: "/calendar" },
  { label: "Store", href: "/store" },
];

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "pages", label: "Pages", icon: <FileText className="h-4 w-4" /> },
  { id: "courses", label: "Courses", icon: <BookOpen className="h-4 w-4" /> },
  { id: "events", label: "Events", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "custom", label: "Custom URL", icon: <Link2 className="h-4 w-4" /> },
];

/** Modal for choosing a link target — a site page, a course, an event, or a
 *  custom URL. Generates the correct href and hands it back via `onPick`. */
export function LinkPickerModal({
  initialValue = "",
  onPick,
  onClose,
}: {
  initialValue?: string;
  onPick: (href: string, label?: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pages");
  const [courses, setCourses] = useState<LinkTarget[] | null>(null);
  const [events, setEvents] = useState<LinkTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState(initialValue);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (tab === "courses" && courses === null) {
      setLoading(true);
      clientFetch<Course[]>("/api/v1/courses/")
        .then((cs) =>
          setCourses(
            cs.map((c) => ({
              label: c.title,
              href: `/courses/${c.slug}`,
              sub: `/courses/${c.slug}`,
            })),
          ),
        )
        .catch(() => setCourses([]))
        .finally(() => setLoading(false));
    }
    if (tab === "events" && events === null) {
      setLoading(true);
      const now = new Date();
      const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      clientFetch<CalendarEvent[]>(
        `/api/v1/calendar/?from=${fmt(now)}&to=${fmt(to)}`,
      )
        .then((es) =>
          setEvents(
            es.map((e) => ({
              label: e.title,
              href: `/calendar/${e.type}/${e.id}`,
              sub: new Date(e.scheduled_at).toLocaleDateString(),
            })),
          ),
        )
        .catch(() => setEvents([]))
        .finally(() => setLoading(false));
    }
  }, [tab, courses, events]);

  const list =
    tab === "pages"
      ? PAGE_TARGETS
      : tab === "courses"
        ? courses
        : tab === "events"
          ? events
          : null;

  const q = query.trim().toLowerCase();
  const filtered =
    list && q
      ? list.filter(
          (t) =>
            t.label.toLowerCase().includes(q) ||
            (t.sub ?? t.href).toLowerCase().includes(q),
        )
      : list;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Choose a link</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 border-b p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setQuery("");
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {tab !== "custom" && (
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${tab}…`}
                  className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {tab === "custom" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Enter a URL or path
                </label>
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    custom.trim() &&
                    onPick(custom.trim(), custom.trim())
                  }
                  placeholder="/path or https://…"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() =>
                    custom.trim() && onPick(custom.trim(), custom.trim())
                  }
                  disabled={!custom.trim()}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Use this link
                </button>
              </div>
            ) : loading && list === null ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered && filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map((target) => (
                  <button
                    key={target.href}
                    type="button"
                    onClick={() => onPick(target.href, target.label)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <span className="font-medium">{target.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {target.sub ?? target.href}
                    </span>
                  </button>
                ))}
              </div>
            ) : q ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No matches for “{query.trim()}”.
              </p>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {tab === "courses" ? "No courses yet." : "No events yet."}
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
