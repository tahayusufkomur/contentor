import { describe, expect, it } from "vitest";
import { demoSeen, markDemoSeen } from "../demo-seen";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("demo-seen", () => {
  it("is unseen until marked, per name", () => {
    const s = memory();
    expect(demoSeen("starter", s)).toBe(false);
    markDemoSeen("starter", s);
    expect(demoSeen("starter", s)).toBe(true);
    expect(demoSeen("other", s)).toBe(false);
  });

  it("works without storage or when it throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(demoSeen("starter", null)).toBe(false);
    expect(demoSeen("starter", broken)).toBe(false);
    expect(() => markDemoSeen("starter", broken)).not.toThrow();
    expect(() => markDemoSeen("starter", null)).not.toThrow();
  });
});
