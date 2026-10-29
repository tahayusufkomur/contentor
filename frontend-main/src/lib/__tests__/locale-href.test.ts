import { describe, expect, it } from "vitest";
import { localizedHref, stripLocale } from "@/lib/locale-href";

describe("localizedHref", () => {
  it("leaves English at its own address", () => {
    expect(localizedHref("/pricing", "en")).toBe("/pricing");
    expect(localizedHref("/", "en")).toBe("/");
  });

  it("prefixes another language", () => {
    expect(localizedHref("/pricing", "tr")).toBe("/tr/pricing");
    expect(localizedHref("/blog/some-post", "de")).toBe("/de/blog/some-post");
  });

  it("keeps the home page, query and hash intact", () => {
    expect(localizedHref("/", "tr")).toBe("/tr");
    expect(localizedHref("/#team", "pl")).toBe("/pl#team");
    expect(localizedHref("/?a=1", "pl")).toBe("/pl?a=1");
    expect(localizedHref("/signup/verify?token=x", "tr")).toBe(
      "/tr/signup/verify?token=x",
    );
  });

  it("does not touch the superadmin panel, the API, hashes or other sites", () => {
    expect(localizedHref("/admin", "tr")).toBe("/admin");
    expect(localizedHref("/admin/email?x=1", "tr")).toBe("/admin/email?x=1");
    expect(localizedHref("/api/auth/logout", "tr")).toBe("/api/auth/logout");
    expect(localizedHref("#", "tr")).toBe("#");
    expect(localizedHref("https://x.example/pricing", "tr")).toBe(
      "https://x.example/pricing",
    );
    expect(localizedHref("//x.example/pricing", "tr")).toBe(
      "//x.example/pricing",
    );
  });

  it("does not mistake a page that starts like admin for the panel", () => {
    expect(localizedHref("/administrators", "tr")).toBe("/tr/administrators");
  });

  it("is not prefixed twice", () => {
    expect(localizedHref("/tr/pricing", "tr")).toBe("/tr/pricing");
  });
});

describe("stripLocale", () => {
  it("gives the page's English address back", () => {
    expect(stripLocale("/tr/pricing")).toBe("/pricing");
    expect(stripLocale("/tr")).toBe("/");
    expect(stripLocale("/pricing")).toBe("/pricing");
    expect(stripLocale("/translate")).toBe("/translate");
  });
});
