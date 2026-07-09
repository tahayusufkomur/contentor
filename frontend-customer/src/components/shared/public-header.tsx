"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useTenant } from "@/hooks/use-tenant";
import { BookOpen, LogOut, Menu, User as UserIcon, X, Zap } from "lucide-react";
import type { User } from "@/types/auth";
import type { NavLink as NavLinkType, NavbarLayout, TenantConfig } from "@/types/tenant";
import AnnouncementBell from "@/components/shared/announcement-bell";

const VALID_LAYOUTS: ReadonlySet<string> = new Set([
  "classic",
  "centered",
  "split",
  "minimal",
  "pill",
]);

const FALLBACK_LINKS: NavLinkType[] = [
  { label: "Courses", href: "/courses" },
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
];

const SIGNED_IN_HIDDEN = new Set(["/about", "/faq"]);

function Brand({ config }: { config: TenantConfig | null }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold">
      {config?.logo_url ? (
        <img src={config.logo_url} alt={config.brand_name} className="h-8 w-auto" />
      ) : (
        <BookOpen className="h-5 w-5 text-primary" />
      )}
      <span className="font-display">{config?.brand_name || "Welcome"}</span>
    </Link>
  );
}

function DesktopLinks({
  links,
  showInstall,
  className = "",
}: {
  links: (NavLinkType & { dot?: boolean })[];
  showInstall: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.label}
          {link.dot && (
            <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </Link>
      ))}
      {showInstall && (
        <Link
          href="/install"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Install app
        </Link>
      )}
    </div>
  );
}

function AuthCluster({
  user,
  hasSubscription,
  showLogin,
  cta,
  compact,
  allowDarkMode,
  signingOut,
  onSignOut,
  dashboardHref,
}: {
  user?: User | null;
  hasSubscription?: boolean;
  showLogin: boolean;
  cta: { text: string; href: string } | null;
  compact?: boolean;
  allowDarkMode: boolean;
  signingOut: boolean;
  onSignOut: () => void;
  dashboardHref: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {allowDarkMode && <ThemeToggle compact className="shrink-0" />}
      {user ? (
        <>
          <Link
            href={dashboardHref}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {user.role === "owner" || user.role === "coach" ? "Admin" : "Dashboard"}
          </Link>
          <AnnouncementBell />
          {!compact && (
            <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
          )}
          <Button
            asChild
            size="sm"
            variant={hasSubscription ? "outline" : "default"}
            className="gap-1.5"
          >
            <Link href="/plans" title={hasSubscription ? "Plans" : "Subscribe"}>
              <Zap className="h-4 w-4" />
              {!compact && (hasSubscription ? "Plans" : "Subscribe")}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            disabled={signingOut}
            className="gap-1.5"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
            {!compact && "Sign Out"}
          </Button>
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
    </div>
  );
}

export function PublicHeader({
  user,
  hasSubscription,
  communityEnabled,
  communityUnread,
  blogEnabled,
}: {
  user?: User | null;
  hasSubscription?: boolean;
  communityEnabled?: boolean;
  communityUnread?: boolean;
  blogEnabled?: boolean;
}) {
  const config = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const navbar = config?.navbar_config;
  const layout: NavbarLayout =
    navbar?.layout && VALID_LAYOUTS.has(navbar.layout) ? navbar.layout : "classic";
  const showInstall = navbar?.show_install !== false;
  const transparent =
    navbar?.transparent_over_hero === true && layout !== "pill" && pathname === "/";

  const allNavLinks = navbar?.links?.length ? navbar.links : FALLBACK_LINKS;
  const navLinks = user
    ? allNavLinks.filter((link) => !SIGNED_IN_HIDDEN.has(link.href))
    : allNavLinks;
  // Signed-in members of a community-enabled tenant get a Community nav entry.
  const withCommunity: (NavLinkType & { dot?: boolean })[] =
    user && communityEnabled
      ? [...navLinks, { label: "Community", href: "/community", dot: communityUnread }]
      : navLinks;
  // Blog only appears once the coach has published at least one post.
  const fullNavLinks: (NavLinkType & { dot?: boolean })[] = blogEnabled
    ? [...withCommunity, { label: "Blog", href: "/blog" }]
    : withCommunity;
  const showLogin = navbar?.show_login !== false;
  const cta = navbar?.cta ?? null;
  const allowDarkMode = config?.dark_mode_enabled !== false;

  useEffect(() => {
    if (!transparent) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?toast=You've+been+logged+out&toast_type=info");
    router.refresh();
  };

  const dashboardHref =
    user?.role === "owner" || user?.role === "coach" ? "/admin" : "/dashboard";

  const authProps = {
    user,
    hasSubscription,
    showLogin,
    cta,
    allowDarkMode,
    signingOut,
    onSignOut: handleSignOut,
    dashboardHref,
  };

  // Hamburger is mobile-only for every preset except minimal (always visible).
  const burgerCls =
    layout === "minimal"
      ? "inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      : "inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden";
  const menuPanelCls =
    layout === "minimal"
      ? "border-t bg-background px-4 py-4"
      : "border-t bg-background px-4 py-4 md:hidden";

  const burger = (
    <button
      className={burgerCls}
      onClick={() => setMobileOpen(!mobileOpen)}
      aria-label="Toggle navigation"
    >
      {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  const menuPanel = mobileOpen && (
    <div className={menuPanelCls}>
      <nav className="flex flex-col gap-3">
        {fullNavLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            {link.label}
            {link.dot && <span className="h-2 w-2 rounded-full bg-primary" />}
          </Link>
        ))}
        {showInstall && (
          <Link
            href="/install"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Install app
          </Link>
        )}
        {user ? (
          <>
            <Link
              href={dashboardHref}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {user.role === "owner" || user.role === "coach" ? "Admin" : "Dashboard"}
            </Link>
            <Button
              asChild
              size="sm"
              variant={hasSubscription ? "outline" : "default"}
              className="w-full gap-1.5"
            >
              <Link href="/plans" onClick={() => setMobileOpen(false)}>
                <Zap className="h-4 w-4" />
                {hasSubscription ? "Plans" : "Subscribe"}
              </Link>
            </Button>
            <div className="flex items-center gap-2 border-t pt-3">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
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
  );

  // ── Pill: fixed floating capsule + spacer ─────────────────────────────────
  if (layout === "pill") {
    return (
      <>
        <header
          data-nav-layout="pill"
          className="fixed inset-x-0 top-3 z-50 px-4 pt-safe pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 rounded-full border border-primary/10 bg-background/75 px-5 shadow-lg backdrop-blur-md">
            <Brand config={config} />
            <nav className="hidden items-center gap-5 md:flex">
              <DesktopLinks links={fullNavLinks} showInstall={showInstall} className="gap-5" />
              <AuthCluster {...authProps} compact />
            </nav>
            {burger}
          </div>
          <div className="pointer-events-auto mx-auto mt-1 max-w-4xl overflow-hidden rounded-2xl border bg-background shadow-lg empty:hidden">
            {menuPanel}
          </div>
        </header>
        {/* Spacer so page content clears the floating pill */}
        <div className="h-20" aria-hidden="true" />
      </>
    );
  }

  // ── All other presets share the header shell ──────────────────────────────
  const shellCls = transparent && !scrolled
    ? "absolute inset-x-0 top-0 z-50 border-b border-transparent bg-transparent pt-safe"
    : "sticky top-0 z-50 border-b border-primary/10 bg-background/80 backdrop-blur-md pt-safe";

  return (
    <header data-nav-layout={layout} className={`${shellCls} transition-colors duration-200`}>
      {layout === "centered" ? (
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center">
            <div />
            <Brand config={config} />
            <div className="hidden justify-end md:flex">
              <AuthCluster {...authProps} compact />
            </div>
            <div className="col-start-3 flex justify-end md:hidden">{burger}</div>
          </div>
          <nav className="hidden h-10 items-center justify-center md:flex">
            <DesktopLinks links={fullNavLinks} showInstall={showInstall} />
          </nav>
        </div>
      ) : layout === "split" ? (
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4">
          <nav className="hidden md:block">
            <DesktopLinks
              links={fullNavLinks.slice(0, Math.ceil(fullNavLinks.length / 2))}
              showInstall={false}
            />
          </nav>
          <div className="md:justify-self-center">
            <Brand config={config} />
          </div>
          <nav className="hidden items-center justify-end gap-6 md:flex">
            <DesktopLinks
              links={fullNavLinks.slice(Math.ceil(fullNavLinks.length / 2))}
              showInstall={showInstall}
            />
            <AuthCluster {...authProps} compact />
          </nav>
          <div className="flex justify-end md:hidden">{burger}</div>
        </div>
      ) : layout === "minimal" ? (
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Brand config={config} />
          <div className="flex items-center gap-2">
            {!user && cta && (
              <Button asChild size="sm">
                <Link href={cta.href}>{cta.text}</Link>
              </Button>
            )}
            {burger}
          </div>
        </div>
      ) : (
        /* classic — today's layout */
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Brand config={config} />
          <nav className="hidden items-center gap-6 md:flex">
            <DesktopLinks links={fullNavLinks} showInstall={showInstall} />
            <AuthCluster {...authProps} />
          </nav>
          {burger}
        </div>
      )}
      {menuPanel}
    </header>
  );
}
