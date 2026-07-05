"use client";

import { TenantContext } from "@/hooks/use-tenant";
import type { TenantConfig } from "@/types/tenant";

export function TenantProvider({
  config,
  children,
}: {
  config: TenantConfig | null;
  children: React.ReactNode;
}) {
  return (
    <TenantContext.Provider value={config}>{children}</TenantContext.Provider>
  );
}
