export const DOCK_TABS = ["assistant", "setup", "help", "history"] as const;
export type DockTab = (typeof DOCK_TABS)[number];

/** The tabs the panel shows right now. */
export function dockTabs({
  setupOpen,
  helpOn,
}: {
  setupOpen: boolean;
  helpOn: boolean;
}): DockTab[] {
  return DOCK_TABS.filter((tab) =>
    tab === "setup" ? setupOpen : tab === "help" ? helpOn : true,
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
