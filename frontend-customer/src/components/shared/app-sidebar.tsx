"use client";

import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { defaultActiveMatch } from "@shared/navigation/navigation-state";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
import { sectionHref } from "@/lib/admin-nav";

export interface NavItem {
  /** Message key under `nav.items` — the page's one name. Its <h1> reads the
   *  same key, so the sidebar, the tab and the page cannot drift apart. */
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Opens the site editor in a new tab. */
  external?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** Pages hidden because the coach did not choose their module; the tab
   *  strip offers them behind "+ N more". */
  hiddenCount?: number;
}

interface AppSidebarProps {
  title: string;
  sections: NavSection[];
  children?: React.ReactNode;
}

export function AppSidebar({ title, sections, children }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    // No aria-label on purpose: e2e selects the sidebar as the one <aside>
    // without a label (the assistant panel is <aside aria-label="Assistant">).
    <aside
      className={cn(
        "hidden flex-col border-r bg-muted motion-safe:transition-[width] duration-200 ease-expo md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header: 52 px, so its hairline meets the top bar's */}
      <div className="flex h-[52px] items-center justify-between gap-2 border-b px-3">
        {!collapsed && (
          <NavLink
            href="/admin"
            className="truncate text-caption font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground"
            title="Back to Creator studio"
          >
            {title}
          </NavLink>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 shrink-0 rounded-full"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 motion-safe:transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </Button>
      </div>

      {/* Navigation: the seven places, caption weight 500, 16 px icons; the
          active one is a paper pill on the second paper (spec 5.6). This <nav>
          holds exactly the section links — e2e counts them. */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <NavLink
            key={section.id}
            href={sectionHref(section)}
            title={collapsed ? section.label : undefined}
            // Lit anywhere inside the section, not only on its first page.
            activeMatch={(current) =>
              section.items.some(
                (i) => !i.external && defaultActiveMatch(current, i.href),
              )
            }
            className={({ active }) =>
              cn(
                "flex h-9 items-center gap-3 rounded-full px-3 text-caption font-medium transition-colors",
                collapsed && "mx-auto w-9 justify-center px-0",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            {({ pending }) => (
              <>
                {pending ? (
                  <Spinner size="sm" className="shrink-0" />
                ) : (
                  <section.icon className="h-4 w-4 shrink-0" />
                )}
                {!collapsed && (
                  <span className="truncate">{section.label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: theme toggle and the user menu, outside the <nav> */}
      <div className="space-y-1 border-t p-2">
        <ThemeToggle collapsed={collapsed} />
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                collapsed,
              })
            : child,
        )}
      </div>
    </aside>
  );
}
