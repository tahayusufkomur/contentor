import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readTokens } from "@shared/lib/contrast";

const sheet = readFileSync(
  path.resolve(__dirname, "../../../../packages/shared/src/styles/tokens.css"),
  "utf8",
);
// One selector block's body. (The sheet's header comment mentions `.dark`,
// so a plain string split would land inside the comment.)
const block = (selector: string) =>
  sheet.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const light = readTokens(block(":root"));
const dark = readTokens(block("\\.dark"));

// Spec 5.7: text pairs read at 4.5:1 on both papers, in both schemes.
const PAIRS: [string, string][] = [
  ["--foreground", "--background"],
  ["--foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--muted"],
  ["--marketing-accent", "--background"],
  ["--marketing-accent", "--muted"],
  ["--primary-foreground", "--primary"],
  ["--marketing-accent-foreground", "--marketing-accent"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s tokens", (_name, tokens) => {
  it.each(PAIRS)("%s on %s ≥ 4.5:1", (fg, bg) => {
    expect(tokens[fg]).toBeDefined();
    expect(tokens[bg]).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps every shadcn token name", () => {
    for (const name of [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--destructive-foreground",
      "--border",
      "--input",
      "--ring",
      "--marketing-accent",
      "--marketing-accent-foreground",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-border",
      "--sidebar-ring",
      "--chart-1",
      "--chart-5",
    ])
      expect(tokens[name], name).toBeDefined();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 0);
    expect(contrastRatio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 0);
  });
});
