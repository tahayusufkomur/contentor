import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATOR_LOCALE_COOKIE,
  creatorLocale,
  namespacesFor,
  surfaceOf,
} from "../surface";

describe("surfaceOf", () => {
  it("studio paths follow the creator", () => {
    expect(surfaceOf("/admin/courses", null, "owner")).toBe("studio");
    expect(surfaceOf("/setup", null, "owner")).toBe("studio");
  });
  it("the owner on their own site", () =>
    expect(surfaceOf("/courses", null, "coach")).toBe("site+owner"));
  it("the full editor frame is the owner's", () =>
    expect(surfaceOf("/", "edit", "owner")).toBe("site+owner"));
  it("the setup preview frame is the plain site", () =>
    expect(surfaceOf("/", "1", "owner")).toBe("site"));
  it("a student or visitor gets the site", () => {
    expect(surfaceOf("/courses", null, "student")).toBe("site");
    expect(surfaceOf("/courses", null)).toBe("site");
  });
  it("/administrator is not /admin", () =>
    expect(surfaceOf("/administrator", null)).toBe("site"));
});

describe("namespacesFor", () => {
  it("a student never gets studio strings", () =>
    expect(namespacesFor("site").creator).toEqual([]));
  it("studio and site+owner", () => {
    expect(namespacesFor("studio")).toEqual({
      creator: ["common", "admin", "studio"],
      site: ["site", "student", "pwa", "blocks"],
    });
    expect(namespacesFor("site+owner")).toEqual({
      creator: ["admin", "studio"],
      site: ["common", "site", "student", "pwa", "blocks"],
    });
  });
  it("the public site never loads the owner tools' content", () =>
    expect(namespacesFor("site").site).not.toContain("blocks"));
});

describe("creatorLocale", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "en,tr,de,pl"));
  afterEach(() => vi.unstubAllEnvs());
  it("reads the creator's cookie by its name, whoever holds the cookies", () => {
    const asked: string[] = [];
    creatorLocale((n) => {
      asked.push(n);
      return undefined;
    });
    expect(asked).toEqual(["user-locale"]);
    expect(CREATOR_LOCALE_COOKIE).toBe("user-locale");
  });
  it("falls back to English without it or with an unknown language", () => {
    expect(creatorLocale(() => undefined)).toBe("en");
    expect(creatorLocale(() => "xx")).toBe("en");
  });
  it("a creator signed in without the cookie speaks the language on their row", () => {
    const row = { role: "owner", preferred_locale: "tr" };
    expect(creatorLocale(() => undefined, row)).toBe("tr");
    expect(creatorLocale(() => undefined, { ...row, role: "coach" })).toBe(
      "tr",
    );
    expect(
      creatorLocale(() => undefined, { ...row, preferred_locale: "" }),
    ).toBe("en");
  });
  it("the cookie wins over the row, and a student's row is never the creator's", () => {
    expect(
      creatorLocale(() => "de", { role: "owner", preferred_locale: "tr" }),
    ).toBe("de");
    expect(
      creatorLocale(() => undefined, {
        role: "student",
        preferred_locale: "tr",
      }),
    ).toBe("en");
    expect(creatorLocale(() => undefined, null)).toBe("en");
  });
});
