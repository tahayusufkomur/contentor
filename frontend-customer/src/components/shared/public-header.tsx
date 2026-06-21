"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useTenant } from "@/hooks/use-tenant";
import { BookOpen, LogOut, Menu, User as UserIcon, X, Zap } from "lucide-react";
import type { User } from "@/types/auth";
import AnnouncementBell from "@/components/shared/announcement-bell";

export function PublicHeader({ user, hasSubscription }: { user?: User | null; hasSubscription?: boolean }) {
  const config = useTenant();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const navbar = config?.navbar_config;
  const allNavLinks = navbar?.links?.length
    ? navbar.links
    : [{ label: "Courses", href: "/courses" }, { label: "Calendar", href: "/calendar" }, { label: "Store", href: "/store" }];
  const SIGNED_IN_HIDDEN = new Set(["/about", "/faq"]);
  const navLinks = user
    ? allNavLinks.filter((link) => !SIGNED_IN_HIDDEN.has(link.href))
    : allNavLinks;
  const showLogin = navbar?.show_login !== false;
  const cta = navbar?.cta;
  const allowDarkMode = config?.dark_mode_enabled !== false;

  const handleSignOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?toast=You've+been+logged+out&toast_type=info");
    router.refresh();
  };

  const dashboardHref =
    user?.role === "owner" || user?.role === "coach" ? "/admin" : "/dashboard";

  return (
    <header className="sticky top-0 z-50 border-b border-primary/10 bg-background/80 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          {config?.logo_url ? (
            <img
              src={config.logo_url}
              alt={config.brand_name}
              className="h-8 w-auto"
            />
          ) : (
            <BookOpen className="h-5 w-5 text-primary" />
          )}
          <span className="font-display">
            {config?.brand_name || "Welcome"}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/install"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Install app
          </Link>

          {allowDarkMode && <ThemeToggle compact className="shrink-0" />}

          {user ? (
            <>
              <Link
                href={dashboardHref}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {user.role === "owner" || user.role === "coach"
                  ? "Admin"
                  : "Dashboard"}
              </Link>
              <div className="flex items-center gap-3">
                <AnnouncementBell />
                <span className="text-sm text-muted-foreground">
                  {user.name || user.email}
                </span>
                <Button asChild size="sm" variant={hasSubscription ? "outline" : "default"} className="gap-1.5">
                  <Link href="/plans">
                    <Zap className="h-4 w-4" />
                    {hasSubscription ? "Plans" : "Subscribe"}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {showLogin && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign In</Link>
                </Button>
              )}
              {cta && (
                <Button asChild size="sm">
                  <Link href={cta.href}>{cta.text}</Link>
                </Button>
              )}
            </div>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/install"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Install app
            </Link>
            {user ? (
              <>
                <Link
                  href={dashboardHref}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {user.role === "owner" || user.role === "coach"
                    ? "Admin"
                    : "Dashboard"}
                </Link>
                <Button asChild size="sm" variant={hasSubscription ? "outline" : "default"} className="w-full gap-1.5">
                  <Link href="/plans" onClick={() => setMobileOpen(false)}>
                    <Zap className="h-4 w-4" />
                    {hasSubscription ? "Plans" : "Subscribe"}
                  </Link>
                </Button>
                <div className="flex items-center gap-2 border-t pt-3">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {user.name || user.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full justify-start gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {showLogin && (
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                )}
                {cta && (
                  <Button asChild size="sm" className="w-full">
                    <Link href={cta.href} onClick={() => setMobileOpen(false)}>
                      {cta.text}
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {allowDarkMode && <ThemeToggle className="justify-start" />}
          </nav>
        </div>
      )}
    </header>
  );
}
