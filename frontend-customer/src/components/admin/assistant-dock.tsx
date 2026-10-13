"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

/** The admin's one assistant: chat, setup checklist, help and change log in
 *  a panel beside the page (a full-screen sheet on a phone). */
export function AssistantDock() {
  const t = useTranslations("admin");
  const dock = useAssistantDock();
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

  if (!dock.isOpen) return null;

  return (
    <aside
      aria-label={t("dock.title")}
      className="fixed inset-0 z-[60] flex flex-col bg-background lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l"
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex gap-1" role="tablist">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
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
          initialTab={tab === "help" ? "help" : "checklist"}
        />
      )}
      {tab === "history" && <CopilotAuditList />}
    </aside>
  );
}
