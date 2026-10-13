import { describe, expect, it } from "vitest";
import { buildAdminNav } from "@/lib/admin-nav";
import { filterPalette, paletteEntries } from "@/lib/admin-palette";

const t = (key: string) => key;
const nav = buildAdminNav(t);
const entries = paletteEntries(nav, t);

describe("paletteEntries", () => {
  it("lists every nav page under its section's name, with the nav's label", () => {
    const pages = entries.filter((e) => e.group !== "palette.create");
    expect(pages.map((e) => [e.group, e.label, e.href])).toEqual(
      nav.flatMap((s) => s.items.map((i) => [s.label, i.label, i.href])),
    );
  });

  it("opens the site editor in a new tab", () => {
    expect(entries.find((e) => e.href === "/?edit=1")?.newTab).toBe(true);
    expect(entries.find((e) => e.href === "/admin/courses")?.newTab).toBe(
      undefined,
    );
  });

  it("offers only creates that open a create form", () => {
    expect(
      entries.filter((e) => e.group === "palette.create").map((e) => e.href),
    ).toEqual(["/admin/courses/new", "/admin/email/compose"]);
  });
});

describe("filterPalette", () => {
  it("returns everything for an empty query", () => {
    expect(filterPalette(entries, "  ")).toEqual(entries);
  });

  it("matches a label or a section name, ignoring case", () => {
    const labelled = [
      { ...entries[0], label: "Courses", group: "Teach" },
      { ...entries[1], label: "Inbox", group: "Students" },
    ];
    expect(filterPalette(labelled, "cour").map((e) => e.label)).toEqual([
      "Courses",
    ]);
    expect(filterPalette(labelled, "STUD").map((e) => e.label)).toEqual([
      "Inbox",
    ]);
    expect(filterPalette(labelled, "zzz")).toEqual([]);
  });
});

describe("old names", () => {
  const found = (query: string) =>
    filterPalette(entries, query).map((e) => e.id);

  it("finds a page by the name it had before the refactor", () => {
    expect(found("billing")).toContain("plan");
    expect(found("subscription")).toContain("plan");
    expect(found("dashboard")).toContain("home");
    expect(found("live events")).toContain("liveEvents");
    expect(found("library")).toEqual(
      expect.arrayContaining(["photos", "videos"]),
    );
    expect(found("send announcement")).toContain("notifications");
    expect(found("bundles")).toContain("store");
  });

  it("still returns nothing for a name no page ever had", () => {
    expect(found("zzz")).toEqual([]);
  });
});
