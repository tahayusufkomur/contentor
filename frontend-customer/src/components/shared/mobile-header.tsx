"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

interface MobileHeaderProps {
  title: string;
  sections: NavSection[];
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

export function MobileHeader({ title, sections }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        sections.map((section) => [
          section.id,
          section.items.some((item) => isItemActive(pathname, item.href)),
        ]),
      ),
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
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold">{title}</span>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      {open && (
        <nav className="border-b bg-card p-2 space-y-1">
          {sections.map((section) => {
            const sectionOpen = openSections[section.id] ?? false;

            return (
              <div key={section.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      sectionOpen && "rotate-180",
                    )}
                  />
                </button>

                {sectionOpen && (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = isItemActive(pathname, item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
