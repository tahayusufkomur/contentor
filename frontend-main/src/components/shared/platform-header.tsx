"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, User as UserIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Wordmark } from "@/components/shared/logo-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";

function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center select-none"
      aria-label="Contentor"
    >
      <Wordmark className="text-base" />
    </Link>
  );
}

export function PlatformHeader({ user }: { user?: User | null }) {
  const router = useRouter();
  const t = useTranslations("common.nav");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border px-4 transition-all duration-300 sm:px-5",
          scrolled
            ? "border-border bg-background/80 shadow-sm backdrop-blur-sm"
            : "border-transparent",
        )}
      >
        <Logo />

        <nav className="hidden items-center gap-7 md:flex">
          <Link
            href="/#features"
            className="nav-link text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("features")}
          </Link>
          <Link
            href="/pricing"
            className="nav-link text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("pricing")}
          </Link>
          <Link
            href="/blog"
            className="nav-link text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("blog")}
          </Link>
          {user && (
            <Link
              href={user.is_superuser ? "/admin" : "/dashboard"}
              className="nav-link text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {user.is_superuser ? t("dashboard") : t("myPlatforms")}
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle compact />
          {user ? (
            <>
              <span className="ml-1 max-w-[140px] truncate text-[13px] text-muted-foreground">
                {user.name || user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                loading={signingOut}
                className="h-8 gap-1.5"
              >
                <LogOut className="h-4 w-4" />
                {t("signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href="/login">{t("signIn")}</Link>
              </Button>
              <Button asChild size="sm" variant="brand" className="h-9">
                <Link href="/signup">{t("getStarted")}</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="mx-auto mt-2 max-w-6xl rounded-xl border bg-popover px-6 py-5 shadow-sm md:hidden">
          <nav className="flex flex-col gap-4">
            <Link
              href="/#features"
              className="text-base font-medium text-foreground/80 hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("features")}
            </Link>
            <Link
              href="/pricing"
              className="text-base font-medium text-foreground/80 hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("pricing")}
            </Link>
            <Link
              href="/blog"
              className="text-base font-medium text-foreground/80 hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("blog")}
            </Link>
            <div className="h-px bg-border" />
            <ThemeToggle className="justify-start" />
            {user ? (
              <>
                <Link
                  href={user.is_superuser ? "/admin" : "/dashboard"}
                  className="text-base font-medium text-foreground/80"
                  onClick={() => setMobileOpen(false)}
                >
                  {user.is_superuser ? t("dashboard") : t("myPlatforms")}
                </Link>
                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {user.name || user.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  loading={signingOut}
                  className="w-full justify-start gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  {t("signOut")}
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    {t("signIn")}
                  </Link>
                </Button>
                <Button asChild variant="brand" className="w-full">
                  <Link href="/signup" onClick={() => setMobileOpen(false)}>
                    {t("getStarted")}
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
