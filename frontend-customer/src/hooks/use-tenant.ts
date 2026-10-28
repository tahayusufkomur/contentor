"use client";

import { createContext, useContext } from "react";
import { resolveLocale } from "@shared/i18n/locales";
import type { TenantConfig } from "@/types/tenant";

export const TenantContext = createContext<TenantConfig | null>(null);

export function useTenant() {
  return useContext(TenantContext);
}

/** The site's language (what a visitor sees), whatever language the studio is in. */
export function useSiteLocale(): string {
  return resolveLocale(useTenant()?.default_locale);
}
