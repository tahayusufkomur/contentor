"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LocaleNavLink, useLocaleNavigate } from "@/i18n/navigation";
import { LogOut, Menu, User as UserIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { BRAND_NAME, Wordmark } from "@/components/shared/logo-mark";
import { ThemeToggle } from "@shared/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";

function Logo() {
  return (
    <LocaleNavLink
      href="/"
      className="flex items-center select-none"
      aria-label={BRAND_NAME}
    >
      <Wordmark className="text-xl" />
    </LocaleNavLink>
  );
}

/** The one marketing bar, sticky on every page. `showBlog`: the language has posts. */
export function PlatformHeaderBar({
  user,
  showBlog,
}: {
  user?: User | null;
  showBlog: boolean;
}) {
  const router = useRouter();
  const navigate = useLocaleNavigate();
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
    navigate("/");
    router.refresh();
  };

  return (
    <header
      className={cn(
        "z-50 border-b bg-background/80 backdrop-blur-md",
        "sticky top-0",
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-12 max-w-media items-center justify-between px-6 transition-colors duration-300",
          scrolled && "border-border",
        )}
      >
        <Logo />

        <nav className="hidden items-center gap-7 md:flex">
          <LocaleNavLink
            href="/#team"
            className="nav-link text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("howItWorks")}
          </LocaleNavLink>
          <LocaleNavLink
            href="/#for"
            className="nav-link text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("whoFor")}
          </LocaleNavLink>
          <LocaleNavLink
            href="/pricing"
            className="nav-link text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("pricing")}
          </LocaleNavLink>
          {showBlog && (
            <LocaleNavLink
              href="/blog"
              className="nav-link text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("blog")}
            </LocaleNavLink>
          )}
          {user && (
            <LocaleNavLink
              href={user.is_superuser ? "/admin" : "/dashboard"}
              className="nav-link text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {user.is_superuser ? t("dashboard") : t("myPlatforms")}
            </LocaleNavLink>
          )}
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher compact className="hidden md:block" />
          <ThemeToggle compact className="shrink-0 text-muted-foreground" />
          <div className="hidden items-center gap-2 md:flex">
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
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3"
                >
                  <LocaleNavLink href="/login">{t("signIn")}</LocaleNavLink>
                </Button>
                <Button asChild size="sm" className="h-8 rounded-full px-4">
                  <LocaleNavLink href="/signup">
                    {t("getStarted")}
                  </LocaleNavLink>
                </Button>
              </>
            )}
          </div>

          <button
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t("toggleNavigation")}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mx-auto mt-2 max-w-6xl rounded-xl border bg-popover px-6 py-5 shadow-sm md:hidden">
          <nav className="flex flex-col gap-4">
            <LocaleNavLink
              href="/#team"
              className="text-base font-medium text-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("howItWorks")}
            </LocaleNavLink>
            <LocaleNavLink
              href="/#for"
              className="text-base font-medium text-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("whoFor")}
            </LocaleNavLink>
            <LocaleNavLink
              href="/pricing"
              className="text-base font-medium text-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {t("pricing")}
            </LocaleNavLink>
            {showBlog && (
              <LocaleNavLink
                href="/blog"
                className="text-base font-medium text-foreground hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {t("blog")}
              </LocaleNavLink>
            )}
            <div className="h-px bg-border" />
            <LanguageSwitcher className="text-base" />
            {user ? (
              <>
                <LocaleNavLink
                  href={user.is_superuser ? "/admin" : "/dashboard"}
                  className="text-base font-medium text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {user.is_superuser ? t("dashboard") : t("myPlatforms")}
                </LocaleNavLink>
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
                  <LocaleNavLink
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("signIn")}
                  </LocaleNavLink>
                </Button>
                <Button asChild variant="brand" className="w-full">
                  <LocaleNavLink
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("getStarted")}
                  </LocaleNavLink>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
