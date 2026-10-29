import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { siteLanguageOptions } from "@/lib/site-language";

describe("siteLanguageOptions", () => {
  const saved = process.env.NEXT_PUBLIC_ENABLED_LOCALES;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLED_LOCALES = "en,tr";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_ENABLED_LOCALES;
    else process.env.NEXT_PUBLIC_ENABLED_LOCALES = saved;
  });

  it("lists the enabled languages by native name, the page's one selected", () => {
    expect(siteLanguageOptions("tr")).toEqual([
      { value: "en", label: "English", selected: false },
      { value: "tr", label: "Türkçe", selected: true },
    ]);
  });
});
