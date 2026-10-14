"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNavigation } from "@shared/navigation/navigation-provider";
import { defaultActiveMatch } from "@shared/navigation/navigation-state";
import { NavLink } from "@/components/ui/nav-link";
import { Globe, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { NavSection } from "@/components/shared/app-sidebar";
import { sectionHref } from "@/lib/admin-nav";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { User } from "@/types/auth";

interface MobileHeaderProps {
  title: string;
  sections: NavSection[];
  user?: User | null;
}

export function MobileHeader({ title, sections, user }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { navigate } = useNavigation();
  const router = useRouter();
  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between border-b px-4 gap-2">
        <NavLink
          href="/admin"
          className="text-sm font-bold tracking-tight hover:text-primary transition-colors truncate"
          title="Back to Admin Overview"
        >
          {title}
        </NavLink>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" />
              <span>View Site</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="border-b bg-card p-2 space-y-1">
          {sections.map((section) => (
            <NavLink
              key={section.id}
              href={sectionHref(section)}
              onClick={() => setOpen(false)}
              activeMatch={(current) =>
                section.items.some(
                  (i) => !i.external && defaultActiveMatch(current, i.href),
                )
              }
              className={({ active }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <section.icon className="h-4 w-4" />
              <span>{section.label}</span>
            </NavLink>
          ))}

          {user && (
            <div className="border-t pt-2 mt-2">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className="text-[10px]">
                    {(user.name || user.email)
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.name || user.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {user.role === "owner" ? "Owner" : "Coach"}
                  </p>
                </div>
              </div>
              <ThemeToggle className="px-3 text-muted-foreground" />
              <button
                onClick={async () => {
                  setSigningOut(true);
                  await fetch("/api/auth/logout", { method: "POST" });
                  navigate(
                    "/login?toast=You've+been+logged+out&toast_type=info",
                  );
                  router.refresh();
                }}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
