"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/components/shared/app-sidebar";

interface MobileHeaderProps {
  title: string;
  navItems: NavItem[];
}

export function MobileHeader({ title, navItems }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
          {navItems.map((item, idx) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            const showHeading =
              item.group && item.group !== navItems[idx - 1]?.group;
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
                    onClick={() => setOpen(false)}
                    className={linkClass}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={linkClass}
                  >
                    {inner}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
