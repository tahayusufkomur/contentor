import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fontSubsets from "@shared/i18n/font-subsets.json";
import locales from "@shared/i18n/locales.json";
import { LOGO_FONT_FAMILIES } from "@shared/logo/catalog";
import { subsetsFor } from "@/lib/logo/brand-kit";

const stylesDir = path.resolve(
  __dirname,
  "../../../../packages/shared/src/sections/styles",
);
const styleFamilies = readdirSync(stylesDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => {
    const { fonts } = JSON.parse(readFileSync(path.join(stylesDir, f), "utf8"));
    return [fonts.display, fonts.body] as string[];
  });

const table = fontSubsets as Record<string, string[]>;
const needed = [...new Set(locales.locales.flatMap((l) => l.subsets))];

describe("font-subsets.json", () => {
  const families = [
    ...new Set([...styleFamilies, ...LOGO_FONT_FAMILIES, "Hanken Grotesk"]),
  ];

  it.each(families)(
    "%s is listed and covers every locale's subsets",
    (family) => {
      expect(
        table[family],
        `${family} missing from font-subsets.json`,
      ).toBeDefined();
      for (const subset of needed) expect(table[family]).toContain(subset);
    },
  );
});

describe("subsetsFor", () => {
  it("plain Latin needs only latin", () => {
    expect(subsetsFor("Yoga")).toEqual(["latin"]);
  });
  it("Turkish and Polish letters add latin-ext", () => {
    expect(subsetsFor("Işık")).toEqual(["latin", "latin-ext"]);
    expect(subsetsFor("Łódź")).toEqual(["latin", "latin-ext"]);
  });
  it("Latin-1 accents (German, etc.) stay in latin", () => {
    expect(subsetsFor("Müller Straße")).toEqual(["latin"]);
  });
});
