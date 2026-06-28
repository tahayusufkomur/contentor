"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { reportUsageOncePerSession } from "@/lib/usage";

export function UsageReporter({ authed = false }: { authed?: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!authed) return; // /api/v1/me/usage/ requires a session — anon would just 403
    if (pathname?.startsWith("/admin")) return; // students/public only
    void reportUsageOncePerSession();
  }, [authed, pathname]);
  return null;
}
