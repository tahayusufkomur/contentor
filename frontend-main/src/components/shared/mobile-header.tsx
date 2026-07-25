"use client";

import { useState } from "react";
import { NavLink } from "@/components/ui/nav-link";
import { useNavigation } from "@shared/navigation/navigation-provider";
import { isNavItemActive } from "@shared/navigation/navigation-state";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavSection } from "@/components/shared/app-sidebar";

interface MobileHeaderProps {
  title: string;
  sections: NavSection[];
}

export function MobileHeader({ title, sections }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const { pathname, pendingHref } = useNavigation();

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
          {sections.map((section) => (
            <div key={section.id}>
              <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </p>
              {section.items.map((item) => {
                const isActive = isNavItemActive(
                  { pathname, pendingHref },
                  item.href,
                );
                const linkClass = cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                );
                const inner = (
                  <>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </>
                );
                return item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className={linkClass}
                  >
                    {inner}
                  </a>
                ) : (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={linkClass}
                  >
                    {inner}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
