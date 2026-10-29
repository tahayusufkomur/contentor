import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alternates } from "@/lib/seo";

describe("alternates", () => {
  const before = process.env.NEXT_PUBLIC_ENABLED_LOCALES;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLED_LOCALES = "en,tr";
  });
  afterEach(() => {
    if (before === undefined) delete process.env.NEXT_PUBLIC_ENABLED_LOCALES;
    else process.env.NEXT_PUBLIC_ENABLED_LOCALES = before;
  });

  it("names the page's own address and every enabled language", () => {
    expect(alternates("/pricing", "tr")).toEqual({
      canonical: "/tr/pricing",
      languages: { en: "/pricing", tr: "/tr/pricing", "x-default": "/pricing" },
    });
  });

  it("keeps English unprefixed and the home page at its root", () => {
    expect(alternates("/", "en")).toEqual({
      canonical: "/",
      languages: { en: "/", tr: "/tr", "x-default": "/" },
    });
  });

  it("leaves out a language that is not enabled", () => {
    process.env.NEXT_PUBLIC_ENABLED_LOCALES = "en";
    expect(alternates("/pricing", "en").languages).toEqual({
      en: "/pricing",
      "x-default": "/pricing",
    });
  });
});
