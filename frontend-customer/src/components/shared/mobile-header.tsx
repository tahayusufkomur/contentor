"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { navigate } = useNavigation();
  const router = useRouter();
  return (
    <div className="md:hidden">
      {/* 52 px bar on paper, hairline below (spec 5.6) */}
      <div className="flex h-[52px] items-center justify-between gap-2 border-b bg-background px-4">
        <NavLink
          href="/admin"
          className="truncate text-caption font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground"
          title="Back to Creator studio"
        >
          {title}
        </NavLink>

        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full px-2 text-muted-foreground hover:text-foreground"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" />
              <span>{t("viewSite")}</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="space-y-1 border-b bg-muted p-2">
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
                  "flex h-10 items-center gap-3 rounded-full px-3 text-caption font-medium transition-colors",
                  active
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <section.icon className="h-4 w-4" />
              <span>{section.label}</span>
            </NavLink>
          ))}

          {user && (
            <div className="mt-2 border-t pt-2">
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption font-medium">
                    {user.name || user.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Creator</p>
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
                className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
