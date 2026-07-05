"use client";

import { GraduationCap, LayoutDashboard, Sparkles } from "lucide-react";

import { useTenant } from "@/hooks/use-tenant";
import { BASE_DOMAIN } from "@/lib/constants";

/**
 * Persistent banner shown on every page of a demo tenant. Lets the visitor
 * flip between student and coach perspectives, and CTAs them into the
 * marketing signup flow (carrying the niche so the template auto-applies).
 */
export function DemoBanner() {
  const config = useTenant();
  // Hidden when this isn't a demo, or when demo read-only is disabled (local dev) —
  // there's nothing read-only to advertise and the tenant is fully editable.
  if (!config?.is_demo || config.demo_readonly === false) return null;

  const niche = config.demo_niche || "";
  const isAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
  const otherRole = isAdmin ? "student" : "coach";
  const otherLabel = isAdmin ? "student" : "coach";

  // Marketing site sits on the apex domain. BASE_DOMAIN excludes the demo subdomain.
  const apex = BASE_DOMAIN.replace(/^demo-[^.]+\./, "");
  const signupHref = `//${apex}/signup${niche ? `?template=${encodeURIComponent(niche)}` : ""}`;

  return (
    <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 text-amber-950 dark:from-amber-950/40 dark:via-orange-950/40 dark:to-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Demo · {config.tenant_name || config.brand_name}
          </span>
          <span className="hidden text-amber-800/80 sm:inline dark:text-amber-200/80">
            · Read-only — sign up to make it yours
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/demo/enter?as=${otherRole}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/40 bg-white/70 px-3 py-1 font-medium text-amber-900 transition-colors hover:bg-white dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            {isAdmin ? (
              <GraduationCap className="h-3.5 w-3.5" />
            ) : (
              <LayoutDashboard className="h-3.5 w-3.5" />
            )}
            View as {otherLabel}
          </a>
          <a
            href={signupHref}
            className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1 font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            Start your own →
          </a>
        </div>
      </div>
    </div>
  );
}
