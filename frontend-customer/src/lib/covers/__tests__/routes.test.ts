import { describe, expect, it } from "vitest";
import { isStudioEditor, STUDIO_TOOLS } from "@/lib/covers/routes";

describe("isStudioEditor", () => {
  it("is true on a design's editor", () => {
    expect(isStudioEditor("/admin/studio/abc")).toBe(true);
    expect(
      isStudioEditor("/admin/studio/6f1c2d9a-0b4e-4c55-9a7e-3c1f5d2b8e10"),
    ).toBe(true);
    expect(isStudioEditor("/admin/studio/abc/")).toBe(true);
  });

  it("is false on the studio's list and on every other page", () => {
    expect(isStudioEditor("/admin/studio")).toBe(false);
    expect(isStudioEditor("/admin/studio/")).toBe(false);
    expect(isStudioEditor("/admin/media")).toBe(false);
    expect(isStudioEditor("/admin")).toBe(false);
    expect(isStudioEditor("/admin/studios/abc")).toBe(false);
    expect(isStudioEditor("/admin/studio/abc/more")).toBe(false);
    expect(isStudioEditor("/courses/abc")).toBe(false);
  });
});

describe("STUDIO_TOOLS", () => {
  it("lists the eight tools of the rail, layouts first", () => {
    expect(STUDIO_TOOLS).toEqual([
      "layouts",
      "photos",
      "edit",
      "text",
      "elements",
      "brand",
      "uploads",
      "generate",
    ]);
    expect(STUDIO_TOOLS[0]).toBe("layouts");
  });
});
