import { describe, expect, it } from "vitest";
import { dockFromUrl, dockTabs } from "@/lib/assistant-dock";

describe("dockTabs", () => {
  it("offers Setup only while setup is unfinished, Help only when it is on", () => {
    expect(dockTabs({ setupOpen: true, helpOn: true })).toEqual([
      "assistant",
      "setup",
      "help",
      "history",
    ]);
    expect(dockTabs({ setupOpen: false, helpOn: false })).toEqual([
      "assistant",
      "history",
    ]);
  });

  it("keeps Setup while she is on it, so finishing the last item shows the celebration", () => {
    expect(
      dockTabs({ setupOpen: false, helpOn: true, setupShowing: true }),
    ).toEqual(["assistant", "setup", "help", "history"]);
  });
});

describe("dockFromUrl", () => {
  it("opens on the tab a link asks for", () => {
    expect(dockFromUrl("?assistant=history", false)).toEqual({
      open: true,
      tab: "history",
    });
  });

  it("keeps the old copilot link working", () => {
    expect(dockFromUrl("?copilot=1", false)).toEqual({
      open: true,
      tab: "assistant",
    });
  });

  it("reopens where the coach left it", () => {
    expect(dockFromUrl("", true)).toEqual({ open: true, tab: "assistant" });
    expect(dockFromUrl("", false)).toEqual({ open: false, tab: "assistant" });
  });

  it("ignores a tab it does not know", () => {
    expect(dockFromUrl("?assistant=billing", false)).toEqual({
      open: false,
      tab: "assistant",
    });
  });
});
