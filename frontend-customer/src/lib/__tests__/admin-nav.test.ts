import { describe, expect, it } from "vitest";
import { activeSection, buildAdminNav, sectionHref } from "@/lib/admin-nav";
import messages from "../../../messages/en/admin.json";

const t = (key: string) => key;
const nav = buildAdminNav(t);
/** The real English, for checks that are about what the coach reads. */
const english = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      messages,
    ) as string;
const section = (id: string) => nav.find((s) => s.id === id)!;
const hrefs = (id: string) => section(id).items.map((i) => i.href);
const at = (pathname: string) =>
  activeSection(nav, { pathname, pendingHref: null })?.id;

describe("buildAdminNav", () => {
  it("has exactly seven sections, in the coach's order", () => {
    expect(nav.map((s) => s.id)).toEqual([
      "home",
      "teach",
      "students",
      "reachOut",
      "money",
      "site",
      "settings",
    ]);
  });

  it("puts each page under the job it serves", () => {
    expect(hrefs("home")).toEqual(["/admin"]);
    expect(hrefs("teach")).toEqual([
      "/admin/courses",
      "/admin/live",
      "/admin/downloads",
    ]);
    expect(hrefs("students")).toEqual([
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
    ]);
    expect(hrefs("reachOut")).toEqual(["/admin/messages", "/admin/blog"]);
    expect(hrefs("money")).toEqual(["/admin/payouts", "/admin/store"]);
    expect(hrefs("site")).toEqual([
      "/?edit=1",
      "/?edit=1&section=brand",
      "/admin/media",
      "/admin/studio",
      "/admin/assistant",
    ]);
    expect(hrefs("settings")).toEqual(["/admin/settings", "/admin/billing"]);
  });

  it("no section and page share a visible name, so links stay unambiguous", () => {
    for (const s of buildAdminNav(english)) {
      expect(s.label, `${s.id} has an English name`).toBeTruthy();
      if (s.items.length === 1) continue; // single-page sections show no tabs
      expect(s.items.map((i) => i.label)).not.toContain(s.label);
    }
  });

  it("gives every item a distinct message key", () => {
    const keys = nav.flatMap((s) => s.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of nav)
      for (const i of s.items) expect(i.label).toBe(`nav.items.${i.key}`);
  });
});

describe("sectionHref", () => {
  it("leads to the section's first page inside the admin", () => {
    expect(sectionHref(section("teach"))).toBe("/admin/courses");
    // Site starts with two links that open the editor in a new tab.
    expect(sectionHref(section("site"))).toBe("/admin/media");
  });
});

describe("activeSection", () => {
  it("finds the section from a page under no nav item", () => {
    expect(at("/admin")).toBe("home");
    expect(at("/admin/courses/new")).toBe("teach");
    expect(at("/admin/students/3")).toBe("students");
    expect(at("/admin/messages/email/new")).toBe("reachOut");
    expect(at("/admin/store/bundles/new")).toBe("money");
    expect(at("/admin/billing")).toBe("settings");
  });

  it("follows a pending navigation before the route commits", () => {
    expect(
      activeSection(nav, { pathname: "/admin", pendingHref: "/admin/blog" })
        ?.id,
    ).toBe("reachOut");
  });

  it("is undefined off the map (raw data)", () => {
    expect(at("/admin/m/users")).toBeUndefined();
  });
});
