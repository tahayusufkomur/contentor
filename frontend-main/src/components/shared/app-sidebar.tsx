"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Render as a plain anchor (e.g. leave the SPA) and open in a new tab. */
  external?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

interface AppSidebarProps {
  title: string;
  sections: NavSection[];
  /** Signed-in user shown under the title. */
  user?: { name?: string; email?: string } | null;
  children?: React.ReactNode;
}

/** Persisted collapse state for the nav groups, keyed by section id. */
const OPEN_STATE_KEY = "admin-nav-open-sections";

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

export function AppSidebar({
  title,
  sections,
  user,
  children,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Default every group open. This matches the server render (localStorage is
  // client-only), so there is no hydration mismatch; persisted collapse state
  // is layered on in the effect below.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((section) => [section.id, true])),
  );

  // Restore the super-admin's persisted collapse choices after mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_STATE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, boolean>;
        setOpenSections((prev) => ({ ...prev, ...stored }));
      }
    } catch {
      // Malformed or blocked storage — defaults (all open) stand.
    }
  }, []);

  const activeSectionId = useMemo(
    () =>
      sections.find((section) =>
        section.items.some((item) => isItemActive(pathname, item.href)),
      )?.id,
    [pathname, sections],
  );

  // Always reveal the group that owns the current route.
  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) =>
      prev[activeSectionId] ? prev : { ...prev, [activeSectionId]: true },
    );
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => {
      // Groups whose items are all schema-driven don't exist in the initial
      // (pre-meta) state, so they read as open via `?? true` but have no key
      // yet — resolve the effective state before flipping it.
      const isOpen = prev[sectionId] ?? true;
      const next = { ...prev, [sectionId]: !isOpen };
      try {
        window.localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable — the toggle still works for this session.
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && (
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {title}
            </span>
            {user && (
              <span className="block truncate text-xs text-muted-foreground">
                {user.name || user.email}
              </span>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {sections.map((section, index) => {
          const sectionOpen = openSections[section.id] ?? true;
          return (
            <div key={section.id} className="space-y-1">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      !sectionOpen && "-rotate-90",
                    )}
                  />
                </button>
              )}

              {(collapsed || sectionOpen) && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isItemActive(pathname, item.href);
                    const linkClass = cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      collapsed && "justify-center px-2",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    );
                    const inner = (
                      <>
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </>
                    );
                    return item.external ? (
                      <a
                        key={item.href}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                        title={collapsed ? item.label : undefined}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={linkClass}
                        title={collapsed ? item.label : undefined}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </div>
              )}

              {collapsed && index < sections.length - 1 && (
                <Separator className="my-2" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-2">
        <Separator className="mb-2" />
        <ThemeToggle collapsed={collapsed} />
        {children}
      </div>
    </aside>
  );
}
