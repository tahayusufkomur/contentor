import { describe, expect, it } from "vitest";

import { buildAdminNav } from "@/lib/admin-nav";

const t = (key: string) => key; // identity translator: assert structure, not copy
const nav = buildAdminNav(t);

const sectionById = (id: string) => nav.find((s) => s.id === id);
const allItems = nav.flatMap((s) => s.items);
const hrefs = allItems.map((i) => i.href);

describe("buildAdminNav — information architecture", () => {
  it("exposes exactly seven destinations", () => {
    expect(nav).toHaveLength(7);
    expect(nav.map((s) => s.id)).toEqual([
      "home",
      "content",
      "mySite",
      "audience",
      "marketing",
      "money",
      "settings",
    ]);
  });

  it("renders Home and Settings as flat single-item links", () => {
    for (const id of ["home", "settings"]) {
      const section = sectionById(id);
      expect(section?.flat).toBe(true);
      expect(section?.items).toHaveLength(1);
    }
  });

  it("renders the five job-stage groups as normal collapsible sections", () => {
    for (const id of ["content", "mySite", "audience", "marketing", "money"]) {
      expect(sectionById(id)?.flat).toBeFalsy();
      expect(sectionById(id)?.items.length).toBeGreaterThan(1);
    }
  });

  it("demotes media: no top-level Photos/Videos, Library lives under Content", () => {
    // Neither photos nor videos is a top-level destination any more.
    expect(nav.map((s) => s.id)).not.toContain("media");
    // The photo library is reachable as a Content sub-item.
    const content = sectionById("content");
    expect(content?.items.some((i) => i.href === "/admin/photos")).toBe(true);
    // /admin/videos intentionally leaves the sidebar (⌘K + pickers only).
    expect(hrefs).not.toContain("/admin/videos");
  });

  it("groups all three money surfaces under Money", () => {
    const money = sectionById("money");
    const moneyHrefs = money?.items.map((i) => i.href) ?? [];
    expect(moneyHrefs).toEqual([
      "/admin/payouts",
      "/admin/billing",
      "/admin/billing?tab=products",
    ]);
  });

  it("keeps every existing route reachable from the sidebar", () => {
    for (const href of [
      "/admin",
      "/admin/courses",
      "/admin/live",
      "/admin/calendar",
      "/admin/downloads",
      "/admin/photos",
      "/admin/site-ai",
      "/admin/assistant",
      "/admin/students",
      "/admin/community",
      "/admin/inbox",
      "/admin/blog",
      "/admin/email",
      "/admin/notifications",
      "/admin/payouts",
      "/admin/billing",
      "/admin/settings",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("preserves the exact label keys e2e depends on", () => {
    const content = sectionById("content");
    const audience = sectionById("audience");
    const calendar = content?.items.find((i) => i.href === "/admin/calendar");
    const students = audience?.items.find((i) => i.href === "/admin/students");
    // With the identity translator, the rendered label IS the i18n key; the
    // real English/Turkish values ("Calendar"/"Students") are asserted by the
    // label-preservation constraint and the e2e specs.
    expect(calendar?.label).toBe("nav.items.calendar");
    expect(students?.label).toBe("nav.items.students");
  });

  it("carries the paid/AI badges onto the right items", () => {
    const badgeFor = (href: string) => allItems.find((i) => i.href === href);
    expect(badgeFor("/admin/live")?.requiresEntitlement).toBe("live");
    expect(badgeFor("/admin/payouts")?.requiresEntitlement).toBe("payouts");
    expect(badgeFor("/admin/billing?tab=products")?.requiresEntitlement).toBe(
      "selling",
    );
    expect(badgeFor("/admin/blog")?.requiresEntitlement).toBe("ai_blog");
    expect(badgeFor("/admin/inbox")?.requiresEntitlement).toBe(
      "platform_mailbox",
    );
    expect(badgeFor("/admin/site-ai")?.requiresEntitlement).toBe("site_ai");
  });

  it("puts Site AI first in My Site — it's the primary way to change the site", () => {
    const mySite = sectionById("mySite");
    expect(mySite?.items[0]?.href).toBe("/admin/site-ai");
  });

  it("marks the external site-editor links", () => {
    const mySite = sectionById("mySite");
    const editSite = mySite?.items.find((i) => i.href === "/?edit=1");
    expect(editSite?.external).toBe(true);
  });
});
