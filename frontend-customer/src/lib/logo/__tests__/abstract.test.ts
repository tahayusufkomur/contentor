import { describe, expect, it } from "vitest";
import { ABSTRACT_FAMILIES, abstractSpec } from "@/lib/logo/abstract";

describe("abstractSpec", () => {
  it("covers all six families", () => {
    expect(ABSTRACT_FAMILIES).toEqual(["orbits", "bloom", "waves", "prism", "knot", "grid"]);
  });

  it("is deterministic per (family, seed)", () => {
    for (const family of ABSTRACT_FAMILIES) {
      expect(abstractSpec(family, 42)).toEqual(abstractSpec(family, 42));
    }
  });

  it("varies with the seed", () => {
    for (const family of ABSTRACT_FAMILIES) {
      expect(JSON.stringify(abstractSpec(family, 1))).not.toEqual(
        JSON.stringify(abstractSpec(family, 2)),
      );
    }
  });

  it("keeps positional coordinates in unit space", () => {
    // `rotate` is a degree angle, not a coordinate — excluded from the check.
    for (const family of ABSTRACT_FAMILIES) {
      for (const seed of [1, 7, 999]) {
        for (const shape of abstractSpec(family, seed)) {
          for (const [key, v] of Object.entries(shape)) {
            if (key === "rotate") continue;
            if (typeof v === "number") expect(Math.abs(v)).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
  });
});
