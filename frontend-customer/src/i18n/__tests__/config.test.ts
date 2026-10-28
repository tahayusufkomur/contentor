import { afterEach, describe, expect, it, vi } from "vitest";
import { enabledLocales, nativeName, ogLocale } from "@shared/i18n/locales";
import { resolveLocale } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("resolveLocale", () => {
  it("a hidden language falls back to English", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "en,tr");
    expect(resolveLocale("tr")).toBe("tr");
    expect(resolveLocale("de")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("with nothing enabled, only English", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "");
    expect(resolveLocale("tr")).toBe("en");
  });
});

describe("enabledLocales", () => {
  it("puts en first and drops unknown codes", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "pl, xx ,tr");
    expect(enabledLocales()).toEqual(["en", "pl", "tr"]);
  });
});

describe("locale names", () => {
  it("native name and og locale", () => {
    expect(nativeName("tr")).toBe("Türkçe");
    expect(ogLocale("pl")).toBe("pl_PL");
  });
});
