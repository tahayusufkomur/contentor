"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileText,
  BookOpen,
  CalendarDays,
  Link2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clientFetch } from "@/lib/api-client";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Spinner } from "@/components/ui/spinner";
import type { Course } from "@/types/course";
import type { CalendarEvent } from "@/types/live";
import { useLocale, useTranslations } from "next-intl";

interface LinkTarget {
  /** What the creator reads in this list. */
  label: string;
  /** What `onPick` hands back as the link's text: the site's own words for a
   *  page (it is written onto the site), the item's title for a course or event. */
  siteLabel: string;
  href: string;
  sub?: string;
}

type Tab = "pages" | "courses" | "events" | "custom";

// Standard site pages a creator can link to. (`pricing` lives at /plans.)
const PAGE_TARGETS = [
  { id: "home", href: "/" },
  { id: "about", href: "/about" },
  { id: "courses", href: "/courses" },
  { id: "pricing", href: "/plans" },
  { id: "faq", href: "/faq" },
  { id: "contact", href: "/contact" },
  { id: "calendar", href: "/calendar" },
  { id: "events", href: "/events" },
  { id: "store", href: "/store" },
] as const;

const TABS: { id: Tab; icon: React.ReactNode }[] = [
  { id: "pages", icon: <FileText className="h-4 w-4" /> },
  { id: "courses", icon: <BookOpen className="h-4 w-4" /> },
  { id: "events", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "custom", icon: <Link2 className="h-4 w-4" /> },
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
  const locale = useLocale();
  const tr = useTranslations("admin.owner.link");
  // The site's own words (the `site` messages): the text a picked page gives
  // the link is written onto the site, so it is in the site's language.
  const ts = useTranslations("site");
  const pageTargets: LinkTarget[] = PAGE_TARGETS.map(({ id, href }) => ({
    label: tr(`page.${id}`),
    siteLabel:
      id === "store"
        ? ts("store.title")
        : id === "pricing"
          ? ts("page.pricingOrPlans")
          : ts(`page.${id}`),
    href,
  }));
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
              siteLabel: c.title,
              href: `/courses/${c.slug}`,
              sub: `/courses/${c.slug}`,
            })),
          ),
        )
        .catch(() => {
          setCourses([]);
          toast.error(tr("coursesError"));
        })
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
              siteLabel: e.title,
              href: `/calendar/${e.type}/${e.id}`,
              sub: new Date(e.scheduled_at).toLocaleDateString(locale),
            })),
          ),
        )
        .catch(() => {
          setEvents([]);
          toast.error(tr("eventsError"));
        })
        .finally(() => setLoading(false));
    }
  }, [tab, courses, events]);

  const list =
    tab === "pages"
      ? pageTargets
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
            <h2 className="text-sm font-semibold">{tr("title")}</h2>
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
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t.icon}
                {tr(`tab.${t.id}`)}
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
                  placeholder={tr(`search.${tab}`)}
                  className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {tab === "custom" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  {tr("enterUrl")}
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
                  placeholder={tr("urlPlaceholder")}
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
                  {tr("useLink")}
                </button>
              </div>
            ) : loading && list === null ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Spinner />
              </div>
            ) : filtered && filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map((target) => (
                  <button
                    key={target.href}
                    type="button"
                    onClick={() => onPick(target.href, target.siteLabel)}
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
                {tr("noMatches", { query: query.trim() })}
              </p>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {tab === "courses" ? tr("noCourses") : tr("noEvents")}
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
