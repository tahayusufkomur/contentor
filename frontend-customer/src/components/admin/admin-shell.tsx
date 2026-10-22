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
import { RunsWatcher } from "@/components/copilot/runs-watcher";
import { FocusBar } from "@/components/focus/focus-bar";
import { EntitlementsProvider } from "@/components/admin/entitlements-provider";
import {
  AssistantDock,
  AssistantDockProvider,
} from "@/components/admin/assistant-dock";
import { useAssistantDock } from "@/lib/assistant-dock";
import { isStudioEditor } from "@/lib/covers/routes";
import { isEmailEditor } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { SectionTabs } from "@/components/admin/section-tabs";
import { useNavigation } from "@shared/navigation/navigation-provider";
import { useTenant } from "@/hooks/use-tenant";
import { usePublishTopnavClearance } from "@/lib/topnav-clearance";
import { activeSection, buildAdminNav } from "@/lib/admin-nav";
import { paletteEntries } from "@/lib/admin-palette";
import { gateAdminNav } from "@/lib/admin-nav-gate";
import { useSetupStatus } from "@/lib/setup-assistant";
import { stopActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import { leaveCreation } from "@/lib/focus/api";
import { focusTimeKey, KIND_ROUTES } from "@/lib/focus/kinds";
import {
  clearActiveCreation,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import type { User } from "@/types/auth";
import { AdminUserContext } from "@/hooks/use-admin-user";

interface AdminShellProps {
  children: React.ReactNode;
  user?: User | null;
}

export function AdminShell({ children, user }: AdminShellProps) {
  return (
    <AdminUserContext.Provider value={user ?? null}>
      <EntitlementsProvider>
        <AssistantDockProvider>
          <AdminShellContent user={user}>{children}</AdminShellContent>
        </AssistantDockProvider>
      </EntitlementsProvider>
    </AdminUserContext.Provider>
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
  const focusKinds = useFocusOverview()?.kinds;
  const paletteItems = useMemo(
    () => paletteEntries(buildAdminNav(t), t, focusKinds),
    [t, focusKinds],
  );

  const section = activeSection(navSections, { pathname, pendingHref });
  // The photo studio's editor and the email editor fill the page: the navigation shrinks to icons, and
  // from 1024 px the page loses its padding (the editor has bars and panels of its own that reach the edges).
  const studio = isStudioEditor(pathname) || isEmailEditor(pathname);
  // Focus mode: the side menu is tucked away and the top bar is the creation's.
  const creation = useActiveCreation();
  // Gone to another page (not Save & leave): it stays open to resume, and
  // the studio is itself again.
  // ponytail: pages are compared without their query (an event's new page and
  // its own page are both /admin/live), so another view of the same path keeps it open.
  const creationPage = creation?.record?.path.split("?")[0] ?? null;
  useEffect(() => {
    if (!creation) return;
    if (
      pathname === KIND_ROUTES[creation.kind]?.newHref.split("?")[0] ||
      pathname === creationPage
    )
      return;
    const timeKey = focusTimeKey(creation.kind);
    if (creation.id)
      void leaveCreation(creation.id, {
        active_ms: takeActiveMs(timeKey),
      }).catch(() => {});
    stopActiveTime(timeKey);
    clearActiveCreation();
  }, [pathname, creation, creationPage]);
  const expandSection = (sectionId: string) =>
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev : [...prev, sectionId],
    );

  return (
    <div className="flex h-screen">
      <AppSidebar
        title={t("title")}
        sections={navSections}
        compact={studio || creation !== null}
      >
        {user && <UserMenu user={user} />}
      </AppSidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title={t("title")} sections={navSections} user={user} />

        {/* Top bar, 52 px: the search pill, the assistant and "View site" as
            paper pills with hairlines (spec 5.6). The ref sits below
            MobileHeader in flow, so the published clearance covers both bars
            and the copilot drawer starts beneath them. */}
        <div
          ref={topbarRef}
          className="flex h-[52px] items-center justify-between gap-3 border-b bg-background px-4"
        >
          {creation ? (
            <FocusBar state={creation} />
          ) : (
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex h-9 w-full min-w-0 max-w-sm items-center gap-2.5 rounded-full border bg-background px-3 text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("palette.placeholder")}</span>
              <kbd className="ml-auto hidden items-center gap-0.5 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                ⌘K
              </kbd>
            </button>
          )}

          {!creation && (
            <Button
              variant="outline"
              className="ml-auto shrink-0 gap-1.5 rounded-full px-3"
              onClick={dock.toggle}
              aria-pressed={dock.isOpen}
            >
              <Sparkles className="h-4 w-4" />
              <span>{t("dock.title")}</span>
              {setup &&
                !setup.dismissed &&
                setup.progress.done < setup.progress.total && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                    {setup.progress.done}/{setup.progress.total}
                  </span>
                )}
            </Button>
          )}

          <Button
            asChild
            variant="outline"
            className="hidden shrink-0 gap-1.5 rounded-full px-3 md:inline-flex"
          >
            <Link href="/" target="_blank" rel="noopener noreferrer">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span>{t("viewSite")}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </Button>
        </div>

        {!creation && (
          <SectionTabs section={section} onExpand={expandSection} />
        )}

        <main
          className={cn(
            "flex-1 overflow-y-auto p-4 md:p-6",
            studio && "lg:p-0",
            // Room under the page for the guide's bottom sheet on a phone.
            creation && "pb-[62vh] md:pb-[62vh] lg:pb-6",
          )}
        >
          {children}
        </main>
      </div>
      <AssistantDock />
      <RunsWatcher />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        entries={paletteItems}
        onAskAssistant={dock.ask}
      />
      <ImpersonationBanner />
    </div>
  );
}
