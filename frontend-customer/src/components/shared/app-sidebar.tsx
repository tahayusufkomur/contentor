"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Globe,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AiBadge, PaidFeatureBadge } from "@/components/admin/feature-badges";
import { useNavigation } from "@shared/navigation/navigation-provider";
import { isNavItemActive } from "@shared/navigation/navigation-state";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
import type { EntitlementKey } from "@/lib/entitlements";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Render an "AI" badge on this item (the feature is AI-powered). */
  ai?: boolean;
  /** Render a "Paid" badge while the coach's plan lacks this entitlement. */
  requiresEntitlement?: EntitlementKey;
  /** The section is only PARTLY paid (some sub-features are free) — softens the
   *  Paid badge tooltip to "Contains paid features". */
  partialPaid?: boolean;
  /** Open in a new tab with an external-link indicator (e.g. "Edit site"). */
  external?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** Render as a single bare top-level link (no collapsible group header).
   *  Used for single-page destinations like Home and Settings. A flat section
   *  must contain exactly one item; that item is rendered directly. */
  flat?: boolean;
  /** Stage-gated: greyed but still clickable. `reasonKey` is an i18n key
   *  explaining what unlocks it; `href` points at the milestone that does. */
  locked?: { reasonKey: string; href: string };
  /** Progressive disclosure: this many items are hidden behind a "+ More"
   *  row. Zero/undefined means everything is shown. */
  hiddenCount?: number;
}

interface AppSidebarProps {
  title: string;
  sections: NavSection[];
  children?: React.ReactNode;
  /** Called when the coach opens a section's "+ More" disclosure. */
  onExpandSection?: (sectionId: string) => void;
}

export function AppSidebar({
  title,
  sections,
  children,
  onExpandSection,
}: AppSidebarProps) {
  const t = useTranslations("admin");
  const [collapsed, setCollapsed] = useState(false);
  const { pathname, pendingHref } = useNavigation();
  const config = useTenant();
  const allowDarkMode = config?.dark_mode_enabled !== false;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((section) => [section.id, true])),
  );

  const activeSectionId = useMemo(
    () =>
      sections.find((section) =>
        section.items.some((item) =>
          isNavItemActive({ pathname, pendingHref }, item.href),
        ),
      )?.id,
    [pathname, pendingHref, sections],
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
        {sections.map((section, index) => {
          if (section.flat) {
            const item = section.items[0];
            return (
              <NavLink
                key={section.id}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                title={collapsed ? item.label : undefined}
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
                      <item.icon className="h-4 w-4 shrink-0" />
                    )}
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          }

          if (section.locked) {
            return (
              <div key={section.id} className="space-y-1">
                {!collapsed && (
                  <div className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    <span>{section.label}</span>
                    <Lock className="h-3 w-3" />
                  </div>
                )}
                <NavLink
                  href={section.locked.href}
                  title={t(section.locked.reasonKey)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60 transition-colors hover:bg-accent/40 hover:text-muted-foreground"
                >
                  {collapsed ? (
                    <Lock className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="text-xs">
                      {t(section.locked.reasonKey)}
                    </span>
                  )}
                </NavLink>
              </div>
            );
          }

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
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      title={collapsed ? item.label : undefined}
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
                            <item.icon className="h-4 w-4 shrink-0" />
                          )}
                          {!collapsed && (
                            <>
                              <span>{item.label}</span>
                              {item.external && (
                                <ExternalLink className="text-muted-foreground/60 ml-auto h-3 w-3" />
                              )}
                              {(item.ai || item.requiresEntitlement) && (
                                <span className="ml-auto flex items-center gap-1">
                                  {item.ai && <AiBadge />}
                                  {item.requiresEntitlement && (
                                    <PaidFeatureBadge
                                      feature={item.requiresEntitlement}
                                      partial={item.partialPaid}
                                    />
                                  )}
                                </span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                  {!collapsed && (section.hiddenCount ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => onExpandSection?.(section.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {t("nav.more", { count: section.hiddenCount ?? 0 })}
                    </button>
                  )}
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
        {allowDarkMode && (
          <ThemeToggle collapsed={collapsed} modes={["light", "dim", "dark"]} />
        )}
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
