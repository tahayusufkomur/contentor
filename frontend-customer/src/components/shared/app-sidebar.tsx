"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

interface AppSidebarProps {
  title: string;
  sections: NavSection[];
  children?: React.ReactNode;
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

export function AppSidebar({ title, sections, children }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const config = useTenant();
  const allowDarkMode = config?.dark_mode_enabled !== false;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((section) => [section.id, true])),
  );

  const activeSectionId = useMemo(
    () =>
      sections.find((section) =>
        section.items.some((item) => isItemActive(pathname, item.href)),
      )?.id,
    [pathname, sections],
  );

  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) =>
      prev[activeSectionId] ? prev : { ...prev, [activeSectionId]: true },
    );
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
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
          <span className="text-sm font-semibold truncate">{title}</span>
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
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      sectionOpen && "rotate-180",
                    )}
                  />
                </button>
              )}

              {(collapsed || sectionOpen) && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isItemActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          collapsed && "justify-center px-2",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
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
        {allowDarkMode && <ThemeToggle collapsed={collapsed} />}
        {children}
      </div>
    </aside>
  );
}
