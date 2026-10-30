import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioFailure } from "../studio-failure";

afterEach(() => vi.restoreAllMocks());

describe("studioFailure", () => {
  it("shows the creator the localized message and logs the original error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("Upload failed: 403");
    expect(studioFailure("mark upload", err, "Yükleme başarısız")).toBe(
      "Yükleme başarısız",
    );
    expect(log).toHaveBeenCalledWith("logo studio: mark upload", err);
  });
});

describe("the logo studio's catch blocks", () => {
  // No DOM in this suite, so the handlers cannot be driven: pin that every
  // failure the studio turns into a localized message goes through the helper.
  const source = readFileSync(
    new URL("../logo-studio.tsx", import.meta.url),
    "utf8",
  );
  it.each([
    ["mark upload", "uploadFailed"],
    ["use library logo", "useFailed"],
    ["use curated logo", "useFailed"],
  ])("%s logs through studioFailure", (context, key) => {
    expect(source).toContain(`studioFailure("${context}", err, t("${key}"))`);
  });
});
