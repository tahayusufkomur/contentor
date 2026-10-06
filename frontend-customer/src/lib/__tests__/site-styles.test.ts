import { describe, expect, it } from "vitest";
import { SITE_STYLES, paletteOf, styleVars } from "@/lib/site-styles";

describe("paletteOf", () => {
  const journal = SITE_STYLES.journal;
  it("is the style's own palette by default and for an unknown id", () => {
    expect(paletteOf(journal)).toBe(journal.palette);
    expect(paletteOf(journal, "")).toBe(journal.palette);
    expect(paletteOf(journal, "mint")).toBe(journal.palette);
  });
  it("swaps in an alternative colourway, keeping the style's type", () => {
    const sage = journal.palettes.find((p) => p.id === "sage")!;
    expect(paletteOf(journal, "sage")).toBe(sage.palette);
    const vars = styleVars(journal, "sage");
    expect(vars.primary).toBe(sage.palette.primary);
    expect(vars.inverse).toBe(sage.palette.inverse);
    expect(vars["font-display"]).toBe(styleVars(journal)["font-display"]);
  });
});
