import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";
import { gateAdminNav } from "@/lib/admin-nav-gate";

const nav = buildAdminNav((key) => key);
const gate = (enabledModules: string[], expandedSections: string[] = []) =>
  gateAdminNav(nav, { enabledModules, expandedSections });
const teach = (sections: ReturnType<typeof gate>) =>
  sections.find((s) => s.id === "teach")!;

describe("gateAdminNav", () => {
  it("shows only Courses under Teach for a coach with no optional modules", () => {
    const section = teach(gate([]));
    expect(section.items.map((i) => i.href)).toEqual(["/admin/courses"]);
    expect(section.hiddenCount).toBe(3);
  });

  it("shows classes and the calendar with the live module", () => {
    const section = teach(gate(["live"]));
    expect(section.items.map((i) => i.href)).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
    ]);
    expect(section.hiddenCount).toBe(1);
  });

  it("hides nothing once every module is on", () => {
    const section = teach(gate(["live", "downloads"]));
    expect(section.items).toHaveLength(4);
    expect(section.hiddenCount).toBeUndefined();
  });

  it("reveals everything when the coach opens + more", () => {
    const section = teach(gate([], ["teach"]));
    expect(section.items).toHaveLength(4);
    expect(section.hiddenCount).toBeUndefined();
  });

  it("never touches the other six sections", () => {
    const gated = gate([]);
    for (const original of nav) {
      if (original.id === "teach") continue;
      expect(gated.find((s) => s.id === original.id)).toBe(original);
    }
  });

  it("keeps the page she is on, even with its module off", () => {
    const on = (pathname: string, pendingHref: string | null = null) =>
      teach(
        gateAdminNav(nav, {
          enabledModules: [],
          expandedSections: [],
          path: { pathname, pendingHref },
        }),
      );
    // Search and Help link to pages of modules she has not turned on.
    expect(on("/admin/live").items.map((i) => i.href)).toEqual([
      "/admin/courses",
      "/admin/live",
    ]);
    expect(on("/admin/live").hiddenCount).toBe(2);
    expect(on("/admin/calendar").items.map((i) => i.href)).toContain(
      "/admin/calendar",
    );
    // A detail page counts, and so does a navigation still pending.
    expect(on("/admin/live/7").items.map((i) => i.href)).toContain(
      "/admin/live",
    );
    expect(on("/admin", "/admin/downloads").items.map((i) => i.href)).toContain(
      "/admin/downloads",
    );
    // Off those pages nothing changes.
    expect(on("/admin/courses").items).toHaveLength(1);
  });
});
