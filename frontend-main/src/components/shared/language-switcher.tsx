"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";

import { routing } from "@/i18n/routing";
import { localizedHref, stripLocale } from "@/lib/locale-href";
import { cn } from "@/lib/utils";
import { nativeName } from "@shared/i18n/locales";

const cookie = routing.localeCookie as { name: string; maxAge: number };

/** The page in each enabled language, by the language's own name. Nothing when
 * only one is enabled. `compact` folds the list into a dropdown for the header. */
export function LanguageSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.language");
  const locale = useLocale();
  const pathname = usePathname() ?? "/";
  if (routing.locales.length < 2) return null;

  // The cookie goes first: the middleware sends an unprefixed address to the
  // cookie's language, so "English" would bounce back to /tr/... without it.
  // A full load, so the page's messages and <html lang> follow the language.
  const go = (e: React.MouseEvent, code: string) => {
    e.preventDefault();
    document.cookie = `${cookie.name}=${code}; path=/; max-age=${cookie.maxAge}; SameSite=Lax`;
    window.location.assign(
      localizedHref(stripLocale(window.location.pathname), code) +
        window.location.search +
        window.location.hash,
    );
  };

  const links = routing.locales.map((code) =>
    code === locale ? (
      <span
        key={code}
        lang={code}
        aria-current="true"
        className="font-medium text-foreground"
      >
        {nativeName(code)}
      </span>
    ) : (
      <a
        key={code}
        href={localizedHref(stripLocale(pathname), code)}
        lang={code}
        hrefLang={code}
        onClick={(e) => go(e, code)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {nativeName(code)}
      </a>
    ),
  );

  if (!compact) {
    return (
      <nav
        aria-label={t("label")}
        className={cn("flex flex-wrap gap-x-4 gap-y-1 text-caption", className)}
      >
        {links}
      </nav>
    );
  }

  return (
    <details className={cn("group relative", className)}>
      <summary
        aria-label={t("label")}
        className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        <Languages className="h-4 w-4" />
        {nativeName(locale)}
      </summary>
      <nav
        aria-label={t("label")}
        className="absolute right-0 top-full z-50 mt-1 flex min-w-32 flex-col gap-2 rounded-xl border bg-popover px-4 py-3 text-[13px] shadow-sm"
      >
        {links}
      </nav>
    </details>
  );
}
