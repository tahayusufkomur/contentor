"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { CopilotAuditList } from "@/components/copilot/audit-list";
import { CopilotBubble } from "@/components/copilot/copilot-bubble";
import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";
import { Button } from "@/components/ui/button";
import { dockFromUrl, dockTabs, type DockTab } from "@/lib/assistant-dock";
import { loadUiState, saveUiState } from "@/lib/copilot/storage";
import { useHelpBotStatus } from "@/lib/help-bot";
import { useSetupStatus } from "@/lib/setup-assistant";
import { cn } from "@/lib/utils";

interface DockApi {
  isOpen: boolean;
  tab: DockTab;
  open: (tab?: DockTab) => void;
  close: () => void;
  toggle: () => void;
}

const DockContext = createContext<DockApi>({
  isOpen: false,
  tab: "assistant",
  open() {},
  close() {},
  toggle() {},
});

/** Open, close or switch the admin's assistant panel from any admin page. */
export const useAssistantDock = () => useContext(DockContext);

export function AssistantDockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("assistant");

  useEffect(() => {
    // window.location, not useSearchParams: avoids the Next 14 client-side
    // Suspense bailout (same reason as copilot-bubble.tsx).
    const start = dockFromUrl(window.location.search, loadUiState().open);
    setTab(start.tab);
    setIsOpen(start.open);
  }, []);

  const open = useCallback((next?: DockTab) => {
    if (next) setTab(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    // The docked chat only ever writes open: true; closing is ours to record,
    // so the panel stays shut on the next page and on the public site.
    saveUiState({ open: false, chatId: loadUiState().chatId });
  }, []);
  const api = useMemo(
    () => ({
      isOpen,
      tab,
      open,
      close,
      toggle: () => (isOpen ? close() : open()),
    }),
    [isOpen, tab, open, close],
  );

  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

/** Below `lg` the panel is a sheet over the page, not a column beside it. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

/** The admin's one assistant: chat, setup checklist, help and change log in
 *  a panel beside the page (a full-screen sheet on a phone). */
export function AssistantDock() {
  const t = useTranslations("admin");
  const dock = useAssistantDock();
  const asideRef = useRef<HTMLElement>(null);
  const sheet = useNarrow() && dock.isOpen;
  const closeDock = dock.close;
  const setup = useSetupStatus();
  const help = useHelpBotStatus();
  // The chat stays mounted once opened, so a turn in flight survives a look
  // at another tab.
  const [chatSeen, setChatSeen] = useState(false);

  const setupLive = !!setup && !setup.dismissed;
  const tabs = dockTabs({
    setupOpen: setupLive && setup.progress.done < setup.progress.total,
    setupShowing: setupLive && dock.tab === "setup",
    helpOn: !help || help.enabled || help.reason !== "disabled",
  });
  const tab = tabs.includes(dock.tab) ? dock.tab : "assistant";

  useEffect(() => {
    if (dock.isOpen && tab === "assistant") setChatSeen(true);
  }, [dock.isOpen, tab]);

  // As a sheet it covers the page, so it behaves as a dialog: the page behind
  // is inert (keyboard and screen reader stay inside), Escape closes it, and
  // focus returns to where she was.
  useEffect(() => {
    const aside = asideRef.current;
    if (!sheet || !aside) return;
    const opener = document.activeElement as HTMLElement | null;
    // The shell renders the dock as a direct sibling of the sidebar and page.
    const behind = Array.from(aside.parentElement?.children ?? []).filter(
      (el) => el !== aside,
    );
    behind.forEach((el) => el.setAttribute("inert", ""));
    aside.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeDock();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      behind.forEach((el) => el.removeAttribute("inert"));
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [sheet, closeDock]);

  if (!dock.isOpen) return null;

  const onTabKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next =
      tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length] ?? tab;
    dock.open(next);
    document.getElementById(`dock-tab-${next}`)?.focus();
  };

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      role={sheet ? "dialog" : undefined}
      aria-modal={sheet || undefined}
      aria-label={t("dock.title")}
      // Beside the page a followed link leaves the panel open; over the page
      // it has to get out of the way.
      onClick={(e) => {
        if (sheet && (e.target as HTMLElement).closest("a[href]")) closeDock();
      }}
      className="fixed inset-0 z-[60] flex flex-col bg-background outline-none lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l"
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div
          className="flex gap-1"
          role="tablist"
          aria-label={t("dock.title")}
          onKeyDown={onTabKey}
        >
          {tabs.map((key) => (
            <button
              key={key}
              id={`dock-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="dock-panel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => dock.open(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`dock.tabs.${key}`)}
              {key === "setup" && setup
                ? ` ${setup.progress.done}/${setup.progress.total}`
                : ""}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={dock.close}
          aria-label={t("dock.close")}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div
        id="dock-panel"
        role="tabpanel"
        aria-labelledby={`dock-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {chatSeen && (
          <div
            className={cn(
              "min-h-0 flex-1 flex-col",
              tab === "assistant" ? "flex" : "hidden",
            )}
          >
            <CopilotBubble docked />
          </div>
        )}
        {(tab === "setup" || tab === "help") && (
          <SetupAssistantPanel
            variant="inline"
            open
            onClose={dock.close}
            onNavigate={() => {}}
            initialTab={tab === "help" ? "help" : "checklist"}
          />
        )}
        {tab === "history" && <CopilotAuditList />}
      </div>
    </aside>
  );
}
