"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { reportUsageOncePerSession } from "@/lib/usage";

export function UsageReporter() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith("/admin")) return; // students/public only
    void reportUsageOncePerSession();
  }, [pathname]);
  return null;
}
