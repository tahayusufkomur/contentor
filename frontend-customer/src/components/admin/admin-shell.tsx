"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Globe, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";
import { MobileHeader } from "@/components/shared/mobile-header";
import { UserMenu } from "@/components/shared/user-menu";
import { CommandPalette } from "@/components/admin/command-palette";
import { EntitlementsProvider } from "@/components/admin/entitlements-provider";
import {
  AssistantDock,
  AssistantDockProvider,
  useAssistantDock,
} from "@/components/admin/assistant-dock";
import { SectionTabs } from "@/components/admin/section-tabs";
import { useNavigation } from "@shared/navigation/navigation-provider";
import { useTenant } from "@/hooks/use-tenant";
import { usePublishTopnavClearance } from "@/lib/topnav-clearance";
import { activeSection, buildAdminNav } from "@/lib/admin-nav";
import { paletteEntries } from "@/lib/admin-palette";
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
      <AssistantDockProvider>
        <AdminShellContent user={user}>{children}</AdminShellContent>
      </AssistantDockProvider>
    </EntitlementsProvider>
  );
}

function AdminShellContent({ children, user }: AdminShellProps) {
  const t = useTranslations("admin");
  const [cmdOpen, setCmdOpen] = useState(false);
  const dock = useAssistantDock();
  const setup = useSetupStatus();
  // Floating UI (copilot drawer) starts below the header bars via this.
  const topbarRef = useRef<HTMLDivElement | null>(null);
  usePublishTopnavClearance(topbarRef);

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

  const config = useTenant();
  const { pathname, pendingHref } = useNavigation();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const navSections = useMemo(() => {
    const sections = buildAdminNav(t);
    // Fail open: until the tenant config loads, show every page so an
    // established coach never sees her tabs pop in.
    if (config === null) return sections;
    return gateAdminNav(sections, {
      enabledModules: config.enabled_modules ?? [],
      expandedSections,
      path: { pathname, pendingHref },
    });
  }, [t, config, expandedSections, pathname, pendingHref]);

  // From the UNGATED nav on purpose: search still finds the pages of a module
  // the coach has not turned on.
  const paletteItems = useMemo(() => paletteEntries(buildAdminNav(t), t), [t]);

  const section = activeSection(navSections, { pathname, pendingHref });
  const expandSection = (sectionId: string) =>
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev : [...prev, sectionId],
    );

  return (
    <div className="flex h-screen">
      <AppSidebar title={t("title")} sections={navSections}>
        {user && <UserMenu user={user} />}
      </AppSidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title={t("title")} sections={navSections} user={user} />

        {/* Top Header Bar with Global Cmd+K Search & View Site. The ref sits
            below MobileHeader in flow, so the published clearance covers
            both bars — the copilot drawer starts beneath them. */}
        <div
          ref={topbarRef}
          className="border-b bg-card px-4 py-2.5 flex items-center justify-between gap-4"
        >
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-lg border transition-colors w-full min-w-0 max-w-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">{t("palette.placeholder")}</span>
            <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] bg-background border px-1.5 py-0.5 rounded shadow-sm text-foreground/80">
              ⌘K
            </kbd>
          </button>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 shrink-0 gap-1.5 text-xs font-medium shadow-sm"
            onClick={dock.toggle}
            aria-pressed={dock.isOpen}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t("dock.title")}</span>
            {setup &&
              !setup.dismissed &&
              setup.progress.done < setup.progress.total && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                  {setup.progress.done}/{setup.progress.total}
                </span>
              )}
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden h-8 shrink-0 gap-1.5 text-xs font-medium shadow-sm md:inline-flex"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span>View Site</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
            </Link>
          </Button>
        </div>

        <SectionTabs section={section} onExpand={expandSection} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <AssistantDock />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        entries={paletteItems}
        onAskAssistant={() => dock.open("assistant")}
      />
      <ImpersonationBanner />
    </div>
  );
}
