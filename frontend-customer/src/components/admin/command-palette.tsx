"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  BookOpen,
  CalendarDays,
  Video,
  Download,
  Users,
  MessagesSquare,
  Inbox,
  Bell,
  Mail,
  Newspaper,
  FileText,
  Palette,
  ImageIcon,
  Film,
  MessageCircleQuestion,
  Wallet,
  CreditCard,
  Settings,
  Database,
  PlusCircle,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  category: "Quick Create" | "Products" | "Audience" | "Website & Media" | "Settings";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  keywords?: string[];
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: CommandItem[] = useMemo(
    () => [
      // Quick Create Actions
      {
        id: "create-course",
        label: "Create New Course",
        category: "Quick Create",
        href: "/admin/courses/new",
        icon: PlusCircle,
        description: "Build a new structured course or curriculum",
        keywords: ["new", "course", "add", "lesson"],
      },
      {
        id: "schedule-live",
        label: "Schedule Live Event",
        category: "Quick Create",
        href: "/admin/live",
        icon: Video,
        description: "Set up a live stream, workshop, or webinar",
        keywords: ["live", "event", "webinar", "class", "zoom"],
      },
      {
        id: "upload-download",
        label: "Upload File / Downloadable",
        category: "Quick Create",
        href: "/admin/downloads",
        icon: Download,
        description: "Add PDFs, templates, or digital assets",
        keywords: ["file", "pdf", "resource", "asset"],
      },
      {
        id: "compose-email",
        label: "Compose Email Broadcast",
        category: "Quick Create",
        href: "/admin/email/compose",
        icon: Mail,
        description: "Send a newsletter or announcement to students",
        keywords: ["email", "send", "newsletter", "broadcast"],
      },
      {
        id: "new-blog",
        label: "New Blog Article",
        category: "Quick Create",
        href: "/admin/blog",
        icon: Newspaper,
        description: "Write and publish a new blog post",
        keywords: ["blog", "article", "post", "write"],
      },

      // Navigation Items
      {
        id: "nav-dashboard",
        label: "Dashboard",
        category: "Products",
        href: "/admin",
        icon: LayoutDashboard,
        keywords: ["home", "overview", "stats"],
      },
      {
        id: "nav-courses",
        label: "Courses",
        category: "Products",
        href: "/admin/courses",
        icon: BookOpen,
        keywords: ["curriculum", "lessons", "classes"],
      },
      {
        id: "nav-live",
        label: "Live Events",
        category: "Products",
        href: "/admin/live",
        icon: Video,
        keywords: ["streaming", "webinars", "zoom"],
      },
      {
        id: "nav-calendar",
        label: "Unified Content Calendar",
        category: "Products",
        href: "/admin/calendar",
        icon: CalendarDays,
        keywords: ["schedule", "events", "blog", "email", "publishing", "calendar"],
      },
      {
        id: "nav-downloads",
        label: "Downloads & Files",
        category: "Products",
        href: "/admin/downloads",
        icon: Download,
        keywords: ["resources", "pdfs", "documents"],
      },

      // Audience & Marketing
      {
        id: "nav-students",
        label: "Students & Enrollees",
        category: "Audience",
        href: "/admin/students",
        icon: Users,
        keywords: ["users", "members", "crm", "customers"],
      },
      {
        id: "nav-community",
        label: "Community Feed",
        category: "Audience",
        href: "/admin/community",
        icon: MessagesSquare,
        keywords: ["forum", "posts", "discussion"],
      },
      {
        id: "nav-inbox",
        label: "Inbox & Messages",
        category: "Audience",
        href: "/admin/inbox",
        icon: Inbox,
        keywords: ["chat", "dms", "direct messages"],
      },
      {
        id: "nav-notifications",
        label: "Announcements & Alerts",
        category: "Audience",
        href: "/admin/notifications",
        icon: Bell,
        keywords: ["push", "notify", "broadcast"],
      },
      {
        id: "nav-email",
        label: "Email Broadcasts",
        category: "Audience",
        href: "/admin/email",
        icon: Mail,
        keywords: ["newsletters", "campaigns"],
      },
      {
        id: "nav-blog",
        label: "Blog Posts",
        category: "Audience",
        href: "/admin/blog",
        icon: Newspaper,
        keywords: ["articles", "seo"],
      },

      // Website & Media
      {
        id: "nav-pages",
        label: "Storefront Pages",
        category: "Website & Media",
        href: "/admin/pages",
        icon: FileText,
        keywords: ["site", "landing", "home"],
      },
      {
        id: "nav-design",
        label: "Theme & Design",
        category: "Website & Media",
        href: "/admin/design",
        icon: Palette,
        keywords: ["branding", "colors", "logo"],
      },
      {
        id: "nav-photos",
        label: "Photo Library",
        category: "Website & Media",
        href: "/admin/photos",
        icon: ImageIcon,
        keywords: ["images", "pictures", "curated"],
      },
      {
        id: "nav-videos",
        label: "Video Library",
        category: "Website & Media",
        href: "/admin/videos",
        icon: Film,
        keywords: ["recordings", "media"],
      },
      {
        id: "nav-assistant",
        label: "AI Site Assistant",
        category: "Website & Media",
        href: "/admin/assistant",
        icon: MessageCircleQuestion,
        keywords: ["bot", "ai", "chat"],
      },

      // Settings & Finance
      {
        id: "nav-payouts",
        label: "Payouts & Earnings",
        category: "Settings",
        href: "/admin/payouts",
        icon: Wallet,
        keywords: ["stripe", "money", "revenue", "connect"],
      },
      {
        id: "nav-billing",
        label: "Platform Billing & Plans",
        category: "Settings",
        href: "/admin/billing",
        icon: CreditCard,
        keywords: ["subscription", "tier", "upgrade"],
      },
      {
        id: "nav-settings",
        label: "General Settings",
        category: "Settings",
        href: "/admin/settings",
        icon: Settings,
        keywords: ["domain", "auth", "profile", "business"],
      },
      {
        id: "nav-data",
        label: "Raw Data Models",
        category: "Settings",
        href: "/admin/m",
        icon: Database,
        keywords: ["database", "schema", "admin kit"],
      },
    ],
    []
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  }, [items, query]);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view when navigating via keyboard
  useEffect(() => {
    if (open && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [selectedIndex, open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? Math.max(0, filteredItems.length - 1) : prev - 1
        );
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        onOpenChange(false);
        router.push(selected.href);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredItems, selectedIndex, router, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-xl border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b px-4 py-3 gap-3 bg-muted/30">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search (e.g. course, email, payouts)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="overflow-y-auto p-2 divide-y divide-border/40">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No matching commands or pages found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(item.href);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-md ${
                        isSelected
                          ? "bg-primary-foreground/10 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                    </div>
                    <div className="truncate">
                      <div className="font-medium leading-tight truncate">
                        {item.label}
                      </div>
                      {item.description && (
                        <div
                          className={`text-xs truncate mt-0.5 ${
                            isSelected
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.category}
                    </span>
                    <ArrowRight
                      className={`h-4 w-4 transition-transform ${
                        isSelected ? "translate-x-0.5" : "opacity-0"
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono rounded border px-1 bg-muted">↑</kbd>{" "}
              <kbd className="font-mono rounded border px-1 bg-muted">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="font-mono rounded border px-1 bg-muted">↵</kbd> to select
            </span>
          </div>
          <span>Coach Admin Command Palette</span>
        </div>
      </div>
    </div>
  );
}
