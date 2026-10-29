"use client";

import { createElement, useCallback, type ComponentProps } from "react";
import { useLocale } from "next-intl";

import { NavLink } from "@/components/ui/nav-link";
import { localizedHref } from "@/lib/locale-href";
import { useNavigate } from "@shared/navigation/navigation-provider";

// NavLink and useNavigate keep driving the top progress bar; these only
// put the page's language into the address around them.

export function LocaleNavLink({
  href,
  ...props
}: ComponentProps<typeof NavLink>) {
  const locale = useLocale();
  return createElement(NavLink, {
    ...props,
    href: localizedHref(href, locale),
  });
}

export function useLocaleNavigate(): (href: string) => void {
  const navigate = useNavigate();
  const locale = useLocale();
  // Stable, like the provider's own `navigate`: callers list it in effect
  // deps, and a new identity per render would re-run those effects.
  return useCallback(
    (href) => navigate(localizedHref(href, locale)),
    [navigate, locale],
  );
}
