import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/nav-link", async () => {
  const { createElement: h } =
    await vi.importActual<typeof import("react")>("react");
  return {
    NavLink: ({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children?: ReactNode;
    }) => h("a", { href, className }, children),
  };
});

import { STYLE_SECTIONS, resolveSection } from "@/components/sections/registry";
import { remap } from "../layout-embed";

describe("embedded layouts", () => {
  it("routes edits of mapped fields to the cx field and ignores the rest", () => {
    const seen: [string, string][] = [];
    const editable = remap(
      { onTextChange: (field, value) => seen.push([field, value]) },
      { heading: "title" },
    );
    editable.onTextChange("heading", "Hi");
    editable.onTextChange("intro", "Would overwrite a same-named cx field");
    expect(seen).toEqual([["title", "Hi"]]);
  });

  it("a variant name from the spec can never resolve to an inherited property", () => {
    for (const name of ["constructor", "__proto__", "toString"]) {
      const Comp = resolveSection(STYLE_SECTIONS, "benefits", `maison.${name}`);
      expect(typeof Comp, name).toBe("function");
      expect(Comp, name).not.toBe(Object);
    }
  });
});
