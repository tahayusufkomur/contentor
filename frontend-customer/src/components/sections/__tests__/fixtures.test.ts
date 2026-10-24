import { describe, expect, it } from "vitest";
import { FAMILIES, FAMILY_IDS, type FamilyField } from "@shared/sections/types";
import { FIXTURE_SETS, fixtureBlock, fixtureData } from "../fixtures";

const real =
  (set: (typeof FIXTURE_SETS)[number]) =>
  (family: (typeof FAMILY_IDS)[number]) =>
    fixtureBlock(family, "x.y", "real", set);

// every text value of a block stays inside the family's own limit
function overLimits(
  value: unknown,
  fields: Record<string, FamilyField>,
  path = "",
): string[] {
  const bad: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    const v = (value as Record<string, unknown>)?.[key];
    if (
      field.type === "text" &&
      field.max &&
      typeof v === "string" &&
      v.length > field.max
    )
      bad.push(`${path}${key} (${v.length} > ${field.max})`);
    if (field.type === "items" && Array.isArray(v) && field.fields)
      v.forEach((item, i) =>
        bad.push(...overLimits(item, field.fields!, `${path}${key}[${i}].`)),
      );
  }
  return bad;
}

describe("real fixture sets", () => {
  it.each(FIXTURE_SETS)("%s fills every family", (set) => {
    for (const family of FAMILY_IDS)
      expect(fixtureBlock(family, "x.y", "real", set)).toBeTruthy();
  });
  it.each(FIXTURE_SETS)("%s home hero follows the composer's rules", (set) => {
    const hero = fixtureBlock("hero", "x.y", "real", set);
    expect(String(hero.headline).length).toBeLessThanOrEqual(36);
    expect(hero.meta ?? "").toBe("");
    expect(hero.secondaryLabel ?? "").toBe("");
    expect(hero.secondaryHref ?? "").toBe("");
  });
  it.each(FIXTURE_SETS)(
    "%s keeps to the composer's list sizes and kickers",
    (set) => {
      const b = real(set);
      const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
      expect(inRange(b("benefits").items.length, 3, 4)).toBe(true);
      expect(inRange(b("moments").photos.length, 3, 4)).toBe(true);
      expect(b("howItWorks").steps).toHaveLength(3);
      expect(fixtureData("courseShowcase", "real", set)).toHaveLength(3);
      expect(fixtureData("pricing", "real", set)).toHaveLength(3);
      expect(fixtureData("events", "real", set)).toHaveLength(3);
      const kickers = FAMILY_IDS.filter((f) => b(f).kicker && f !== "hero");
      expect(b("hero").kicker).toBeTruthy();
      expect(kickers.length).toBeLessThanOrEqual(2);
    },
  );
  it.each(FIXTURE_SETS)(
    "%s stays inside every family's field limits",
    (set) => {
      for (const family of FAMILY_IDS)
        expect(overLimits(real(set)(family), FAMILIES[family].fields)).toEqual(
          [],
        );
    },
  );
  it("long and short are unchanged by the set", () => {
    expect(fixtureBlock("hero", "x.y", "long", "family")).toEqual(
      fixtureBlock("hero", "x.y", "long"),
    );
    expect(fixtureData("pricing", "short", "business")).toHaveLength(1);
  });
});
