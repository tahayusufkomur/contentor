"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional section heading this item belongs to. */
  group?: string;
  /** Render as a plain anchor (e.g. leave the SPA) and open in a new tab. */
  external?: boolean;
}

interface AppSidebarProps {
  title: string;
  navItems: NavItem[];
  /** Signed-in user shown under the title. */
  user?: { name?: string; email?: string } | null;
  children?: React.ReactNode;
}

export function AppSidebar({
  title,
  navItems,
  user,
  children,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
        {navItems.map((item, idx) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          // Emit a group heading when the group changes from the previous item.
          const showHeading =
            !collapsed && item.group && item.group !== navItems[idx - 1]?.group;
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
              {!collapsed && <span className="truncate">{item.label}</span>}
            </>
          );
          return (
            <div key={item.href}>
              {showHeading && (
                <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {item.group}
                </p>
              )}
              {item.external ? (
                <a
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
                  href={item.href}
                  className={linkClass}
                  title={collapsed ? item.label : undefined}
                >
                  {inner}
                </Link>
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
