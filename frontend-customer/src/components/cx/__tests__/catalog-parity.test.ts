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

import { CX_CATALOG } from "@shared/cx/types";
import { ICON_NAMES } from "../atoms";
import { CX_PRIMITIVES } from "../primitives";

describe("catalog parity", () => {
  it("every catalog primitive has a renderer, and nothing else does", () => {
    expect(Object.keys(CX_PRIMITIVES).sort()).toEqual(
      Object.keys(CX_CATALOG.primitives).sort(),
    );
  });

  it("every catalog icon has a glyph", () => {
    expect([...ICON_NAMES].sort()).toEqual([...CX_CATALOG.icons].sort());
  });
});
