import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTokens } from "@shared/lib/contrast";
import { ADMIN_THEME_COLOR } from "@/lib/admin-theme-color";
import { oklchToHex } from "@/lib/site-styles";

// <meta name="theme-color"> takes no oklch(): the two hex literals must be the
// token sheet's papers, so the browser bar never drifts from the studio.
const sheet = readFileSync(
  path.resolve(__dirname, "../../../../packages/shared/src/styles/tokens.css"),
  "utf8",
);
const [lightBlock, darkBlock] = sheet.split("\n.dark");

describe("ADMIN_THEME_COLOR", () => {
  it("is the light paper", () => {
    expect(ADMIN_THEME_COLOR.light).toBe(
      oklchToHex(readTokens(lightBlock)["--background"]),
    );
  });
  it("is the dark paper", () => {
    expect(ADMIN_THEME_COLOR.dark).toBe(
      oklchToHex(readTokens(".dark" + darkBlock)["--background"]),
    );
  });
});
