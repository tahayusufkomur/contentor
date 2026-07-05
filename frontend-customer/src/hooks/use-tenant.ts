"use client";

import { createContext, useContext } from "react";
import type { TenantConfig } from "@/types/tenant";

export const TenantContext = createContext<TenantConfig | null>(null);

export function useTenant() {
  return useContext(TenantContext);
}
