"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";

import { routing } from "@/i18n/routing";
import { localizedHref, stripLocale } from "@/lib/locale-href";
import { cn } from "@/lib/utils";
import { nativeName } from "@shared/i18n/locales";

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
  const details = useRef<HTMLDetailsElement>(null);
  // The query and hash are only known in the browser: the first render links
  // to the bare page (what a no-JS visitor gets), then they are added.
  const [tail, setTail] = useState("");
  useEffect(() => {
    const read = () => setTail(window.location.search + window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  // The dropdown closes on Escape (focus back on its button) and on a click
  // outside it.
  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector("summary")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [compact]);

  if (routing.locales.length < 2) return null;

  // Plain links, so a new tab or no JavaScript works too. Every address names
  // its language, English included (/en/pricing): the middleware keeps the
  // choice in the cookie and sends /en/... to the unprefixed page. Without
  // that, "English" from /tr/pricing would be sent straight back by the cookie.
  const base = stripLocale(pathname);
  const hrefFor = (code: string) =>
    (code === routing.defaultLocale
      ? `/${code}${base === "/" ? "" : base}`
      : localizedHref(base, code)) + tail;

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
        href={hrefFor(code)}
        lang={code}
        hrefLang={code}
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
    <details ref={details} className={cn("group relative", className)}>
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
