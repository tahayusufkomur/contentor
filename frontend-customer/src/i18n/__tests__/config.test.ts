import { describe, expect, it } from "vitest";
import { resolveLocale } from "../config";

describe("resolveLocale", () => {
  it("uses English for a valid or missing cookie", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("renders English for a stale Turkish cookie instead of loading a missing bundle", () => {
    expect(resolveLocale("tr")).toBe("en");
  });
});
