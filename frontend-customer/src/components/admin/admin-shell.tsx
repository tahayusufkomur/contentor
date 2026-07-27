"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Globe, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";
import { MobileHeader } from "@/components/shared/mobile-header";
import { UserMenu } from "@/components/shared/user-menu";
import { SetupAssistantBubble } from "@/components/setup/setup-assistant-bubble";
import { CommandPalette } from "@/components/admin/command-palette";
import {
  EntitlementsProvider,
  useEntitlements,
} from "@/components/admin/entitlements-provider";
import { useTenant } from "@/hooks/use-tenant";
import { buildAdminNav } from "@/lib/admin-nav";
import { gateAdminNav } from "@/lib/admin-nav-gate";
import { useSetupStatus } from "@/lib/setup-assistant";
import type { User } from "@/types/auth";

interface AdminShellProps {
  children: React.ReactNode;
  user?: User | null;
}

export function AdminShell({ children, user }: AdminShellProps) {
  return (
    <EntitlementsProvider>
      <AdminShellContent user={user}>{children}</AdminShellContent>
    </EntitlementsProvider>
  );
}

/**
 * The shell's actual content, split out from `AdminShell` so it renders
 * INSIDE `EntitlementsProvider` rather than being the component that mounts
 * it. `useContext` resolves by walking UP the fiber tree from where it's
 * called — a component that returns a Provider as part of its own JSX is an
 * ANCESTOR of that provider, not a descendant, so calling `useEntitlements()`
 * in `AdminShell` itself would only ever see the context's default
 * (`entitlements: null`), never the fetched value. `hasSiteAi` needs the real
 * value, so the call has to live one level below the provider.
 */
function AdminShellContent({ children, user }: AdminShellProps) {
  const t = useTranslations("admin");
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const status = useSetupStatus();
  const config = useTenant();
  const { entitlements } = useEntitlements();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Confirmed-true only. useIsLocked() fails OPEN (false while entitlements
  // load), which would briefly hide the manual editor from a free coach — the
  // one thing this must never do. So read the value explicitly.
  const hasSiteAi = entitlements?.site_ai === true;

  // The site is live only when the checklist's `publish` item is AUTO-derived
  // (compute_setup_state sets source="auto" from tenant.is_published). A coach
  // can manually tick `publish` in the Setup Assistant, which sets done=true
  // with source="manual" — that must never unlock Marketing or fire the
  // celebration, per this plan's "never gate on manual ticks" constraint.
  const published =
    status?.items.find((item) => item.key === "publish")?.source === "auto";
  // Fail open: until BOTH signals have loaded, render the nav ungated so an
  // established coach never sees a flash of locks they already cleared.
  const stateReady = status !== null && config !== null;

  const navSections = useMemo(() => {
    const sections = buildAdminNav(t);
    if (!stateReady) return sections;
    return gateAdminNav(sections, {
      published,
      enabledModules: config?.enabled_modules ?? [],
      hasSiteAi,
      expandedSections,
    });
  }, [
    t,
    stateReady,
    published,
    config?.enabled_modules,
    hasSiteAi,
    expandedSections,
  ]);

  // One-time flourish when Marketing opens. Stored in localStorage rather than
  // setup_progress: the setup PATCH endpoint whitelists only `dismissed` and
  // `item`, and a cosmetic toast does not justify a backend field. Trade-off:
  // a coach may see it once per device.
  //
  // Must fire ONLY on a genuine false→true transition witnessed within this
  // session, never merely "published is true on the render where stateReady
  // first became true" — otherwise every already-published coach gets a
  // "you're live!" celebration on their next page load after this shipped.
  // prevPublished starts at null ("unknown"), so the render that first
  // resolves stateReady only records the baseline and never fires itself.
  const celebrated = useRef(false);
  const prevPublished = useRef<boolean | null>(null);
  useEffect(() => {
    if (!stateReady) return;
    const wasPublished = prevPublished.current;
    prevPublished.current = published;
    if (celebrated.current || wasPublished !== false || !published) return;
    celebrated.current = true;
    const key = "contentor_marketing_unlock_seen";
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return; // private mode / storage disabled → skip the flourish entirely
    }
    toast.success(t("nav.unlocked.marketing"));
  }, [stateReady, published, t]);

  return (
    <div className="flex h-screen">
      <AppSidebar
        title={t("title")}
        sections={navSections}
        onExpandSection={(sectionId) =>
          setExpandedSections((prev) =>
            prev.includes(sectionId) ? prev : [...prev, sectionId],
          )
        }
      >
        {user && <UserMenu user={user} />}
      </AppSidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader
          title={t("title")}
          sections={navSections}
          user={user}
          onExpandSection={(sectionId) =>
            setExpandedSections((prev) =>
              prev.includes(sectionId) ? prev : [...prev, sectionId],
            )
          }
        />

        {/* Top Header Bar with Global Cmd+K Search & View Site */}
        <div className="border-b bg-card px-4 py-2.5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-lg border transition-colors w-full max-w-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">Search commands or pages...</span>
            <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] bg-background border px-1.5 py-0.5 rounded shadow-sm text-foreground/80">
              ⌘K
            </kbd>
          </button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium shrink-0 shadow-sm"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span>View Site</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
            </Link>
          </Button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <SetupAssistantBubble />
      <ImpersonationBanner />
    </div>
  );
}
