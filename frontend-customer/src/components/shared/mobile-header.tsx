"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@/types/auth";

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
  user?: User | null;
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

export function MobileHeader({ title, sections, user }: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
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

          {user && (
            <div className="border-t pt-2 mt-2">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className="text-[10px]">
                    {(user.name || user.email).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                  <p className="text-[11px] text-muted-foreground">{user.role === "owner" ? "Owner" : "Coach"}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setSigningOut(true);
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login?toast=You've+been+logged+out&toast_type=info");
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
