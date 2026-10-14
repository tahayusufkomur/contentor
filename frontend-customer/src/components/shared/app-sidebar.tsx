"use client";

import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { defaultActiveMatch } from "@shared/navigation/navigation-state";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
import { sectionHref } from "@/lib/admin-nav";
import type { EntitlementKey } from "@/lib/entitlements";

export interface NavItem {
  /** Message key under `nav.items` — the page's one name. Its <h1> reads the
   *  same key, so the sidebar, the tab and the page cannot drift apart. */
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A quiet lock shows while the coach's plan lacks this entitlement. */
  requiresEntitlement?: EntitlementKey;
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
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-3 gap-2">
        {!collapsed && (
          <NavLink
            href="/admin"
            className="text-sm font-bold tracking-tight truncate hover:text-primary transition-colors"
            title="Back to Admin Overview"
          >
            {title}
          </NavLink>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 ml-auto"
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
                {!collapsed && <span>{section.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-2">
        <Separator className="mb-2" />
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
