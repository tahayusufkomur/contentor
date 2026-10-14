import { describe, expect, it } from "vitest";
import { badgeVariants } from "@shared/ui/badge";
import { buttonVariants } from "@shared/ui/button";

// Spec 5.6 / D7: the primitives change class strings only, and both apps
// consume them. The legacy variants stay and resolve to the premium pair.
const VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
  "brand",
  "glass",
] as const;

describe("Button variants", () => {
  it("maps brand to the primary and glass to the outline classes", () => {
    expect(buttonVariants({ variant: "brand" })).toBe(
      buttonVariants({ variant: "default" }),
    );
    expect(buttonVariants({ variant: "glass" })).toBe(
      buttonVariants({ variant: "outline" }),
    );
  });

  it("casts no shadow", () => {
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant }), variant).not.toMatch(/\bshadow-/);
    }
  });

  it("never puts an alpha on a token colour", () => {
    // bg-primary/90, ring-ring/50 … emit nothing on this checkout: the
    // Tailwind colours are plain var() strings without <alpha-value>.
    for (const variant of VARIANTS) {
      expect(buttonVariants({ variant }), variant).not.toMatch(
        /\b(bg|text|border|ring)-[a-z-]+\/\d/,
      );
    }
  });

  it("keeps the heights", () => {
    expect(buttonVariants({ size: "default" })).toMatch(/\bh-9\b/);
    expect(buttonVariants({ size: "sm" })).toMatch(/\bh-8\b/);
    expect(buttonVariants({ size: "lg" })).toMatch(/\bh-10\b/);
    expect(buttonVariants({ size: "xl" })).toMatch(/\bh-12\b/);
    expect(buttonVariants({ size: "icon" })).toMatch(/\bsize-9\b/);
  });
});

describe("Badge variants", () => {
  it("renders pro with tokens only", () => {
    const cls = badgeVariants({ variant: "pro" });
    expect(cls).not.toMatch(/amber|yellow|orange/);
    expect(cls).toMatch(/marketing-accent/);
  });

  it("never puts an alpha on a token colour", () => {
    for (const variant of [
      "default",
      "secondary",
      "destructive",
      "outline",
      "success",
      "warning",
      "brand",
      "pro",
      "accent",
      "glass",
    ] as const) {
      expect(badgeVariants({ variant }), variant).not.toMatch(
        /\b(bg|text|border|ring)-[a-z-]+\/\d/,
      );
    }
  });
});
