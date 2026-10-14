import { describe, expect, it } from "vitest";
import preset from "../../../../packages/shared/tailwind-preset";

// Phase 2–4 markup relies on these utility names (plan "Contracts").
describe("shared tailwind preset", () => {
  const ext = preset.theme?.extend as Record<string, Record<string, unknown>>;
  it("defines the type scale", () => {
    for (const k of ["display", "display-2", "title", "title-2", "body-lg", "body", "caption"])
      expect(ext.fontSize[k], k).toBeDefined();
  });
  it("defines columns, easing and the tile radius", () => {
    expect(ext.maxWidth.text).toBe("980px");
    expect(ext.maxWidth.media).toBe("1440px");
    expect(ext.transitionTimingFunction.expo).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(ext.borderRadius.tile).toBe("18px");
  });
});
