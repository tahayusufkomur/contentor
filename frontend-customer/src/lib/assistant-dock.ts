import { createContext, useContext } from "react";

export const DOCK_TABS = ["assistant", "setup", "help", "history"] as const;
export type DockTab = (typeof DOCK_TABS)[number];

/** The tabs the panel shows right now. */
export function dockTabs({
  setupOpen,
  helpOn,
  setupShowing = false,
}: {
  setupOpen: boolean;
  helpOn: boolean;
  /** She is on the Setup tab: it stays, so finishing the last item shows the
   *  celebration instead of jumping her to the chat. */
  setupShowing?: boolean;
}): DockTab[] {
  return DOCK_TABS.filter((tab) =>
    tab === "setup"
      ? setupOpen || setupShowing
      : tab === "help"
        ? helpOn
        : true,
  );
}

/** Whether the panel starts open, and on which tab: `?assistant=<tab>` wins,
 *  then the old `?copilot=1`, then where the coach left it. */
export function dockFromUrl(
  search: string,
  wasOpen: boolean,
): { open: boolean; tab: DockTab } {
  const params = new URLSearchParams(search);
  const asked = params.get("assistant");
  if (asked && (DOCK_TABS as readonly string[]).includes(asked)) {
    return { open: true, tab: asked as DockTab };
  }
  return {
    open: params.get("copilot") === "1" || wasOpen,
    tab: "assistant",
  };
}

export interface DockApi {
  isOpen: boolean;
  tab: DockTab;
  open: (tab?: DockTab) => void;
  close: () => void;
  toggle: () => void;
  /** Words waiting to be sent to the assistant (from the search box). */
  pendingAsk: string | null;
  /** Open the chat and send these words as a new conversation. */
  ask: (text: string) => void;
  clearAsk: () => void;
}

/** Outside the admin (the public site, the site editor) there is no dock:
 *  the default is closed and does nothing. */
export const DockContext = createContext<DockApi>({
  isOpen: false,
  tab: "assistant",
  open() {},
  close() {},
  toggle() {},
  pendingAsk: null,
  ask() {},
  clearAsk() {},
});

/** Open, close or switch the admin's assistant panel from any admin page. */
export const useAssistantDock = () => useContext(DockContext);
