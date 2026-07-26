import { describe, expect, it } from "vitest";

import { buildAdminNav } from "@/lib/admin-nav";
import { gateAdminNav, type NavGateState } from "@/lib/admin-nav-gate";

const t = (key: string) => key; // identity translator: assert structure, not copy

const base = (over: Partial<NavGateState> = {}): NavGateState => ({
  published: false,
  enabledModules: ["analytics", "billing", "courses", "pages"],
  expandedSections: [],
  hasSiteAi: false,
  ...over,
});

const gate = (state: NavGateState) => gateAdminNav(buildAdminNav(t), state);
const section = (state: NavGateState, id: string) =>
  gate(state).find((s) => s.id === id);
const hrefs = (state: NavGateState, id: string) =>
  section(state, id)?.items.map((i) => i.href) ?? [];

describe("gateAdminNav — Marketing lock", () => {
  it("locks Marketing before publish, with a reason and a milestone link", () => {
    const marketing = section(base(), "marketing");
    expect(marketing?.locked).toEqual({
      reasonKey: "nav.locked.marketing",
      href: "/admin#publish-card",
    });
  });

  it("unlocks Marketing once published", () => {
    expect(
      section(base({ published: true }), "marketing")?.locked,
    ).toBeUndefined();
  });

  it("never locks Audience, Money, My Site, Home or Settings", () => {
    for (const id of ["audience", "money", "mySite", "home", "settings"]) {
      expect(section(base(), id)?.locked).toBeUndefined();
    }
  });

  it("keeps every Marketing item present while locked (explained, not removed)", () => {
    expect(hrefs(base(), "marketing")).toEqual([
      "/admin/blog",
      "/admin/email",
      "/admin/notifications",
    ]);
  });
});

describe("gateAdminNav — Content progressive disclosure", () => {
  it("shows only Courses for a coach with no goal modules", () => {
    expect(hrefs(base(), "content")).toEqual(["/admin/courses"]);
  });

  it("reports how many Content items are hidden", () => {
    // courses shown; live, calendar, downloads, library hidden
    expect(section(base(), "content")?.hiddenCount).toBe(4);
  });

  it("shows Live Events and Calendar when the live module is enabled", () => {
    const state = base({ enabledModules: ["courses", "live"] });
    expect(hrefs(state, "content")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
    ]);
  });

  it("shows Downloads when the downloads module is enabled", () => {
    const state = base({ enabledModules: ["courses", "downloads"] });
    expect(hrefs(state, "content")).toContain("/admin/downloads");
    expect(hrefs(state, "content")).not.toContain("/admin/live");
  });

  it("reveals everything when expanded, and reports nothing hidden", () => {
    const state = base({ expandedSections: ["content"] });
    expect(hrefs(state, "content")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
      "/admin/downloads",
      "/admin/photos",
    ]);
    expect(section(state, "content")?.hiddenCount).toBe(0);
  });

  it("leaves other sections' items untouched", () => {
    expect(hrefs(base(), "audience")).toEqual([
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
    ]);
  });
});

describe("gateAdminNav — no regression for established tenants", () => {
  it("a published tenant with every module sees an ungated nav", () => {
    const state = base({
      published: true,
      enabledModules: [
        "courses",
        "live",
        "downloads",
        "campaigns",
        "community",
      ],
    });
    expect(section(state, "marketing")?.locked).toBeUndefined();
    expect(section(state, "content")?.hiddenCount).toBe(1); // only Library
  });

  it("returns the same seven sections in the same order", () => {
    expect(gate(base()).map((s) => s.id)).toEqual([
      "home",
      "content",
      "mySite",
      "audience",
      "marketing",
      "money",
      "settings",
    ]);
  });
});

describe("gateAdminNav — My Site editor de-emphasis", () => {
  it("keeps the manual editor prominent for a coach without AI", () => {
    const mySite = section(base({ hasSiteAi: false }), "mySite");
    expect(mySite?.items.map((i) => i.href)).toEqual([
      "/admin/site-ai",
      "/?edit=1",
      "/?edit=1&section=brand",
      "/admin/assistant",
    ]);
    expect(mySite?.hiddenCount ?? 0).toBe(0);
  });

  it("tucks Edit site and Design behind Advanced editing when the coach has AI", () => {
    const mySite = section(base({ hasSiteAi: true }), "mySite");
    expect(mySite?.items.map((i) => i.href)).toEqual([
      "/admin/site-ai",
      "/admin/assistant",
    ]);
    expect(mySite?.hiddenCount).toBe(2);
    expect(mySite?.moreLabelKey).toBe("nav.advancedEditing");
  });

  it("reveals the manual editor when Advanced editing is expanded", () => {
    const mySite = section(
      base({ hasSiteAi: true, expandedSections: ["mySite"] }),
      "mySite",
    );
    expect(mySite?.items.map((i) => i.href)).toContain("/?edit=1");
    expect(mySite?.hiddenCount).toBe(0);
  });

  it("uses the default + More label for Content", () => {
    expect(section(base(), "content")?.moreLabelKey).toBeUndefined();
  });
});
