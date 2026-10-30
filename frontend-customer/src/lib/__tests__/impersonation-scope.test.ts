import { describe, expect, it } from "vitest";
import { scopeOfToken } from "../impersonation-scope";

const jwt = (payload: unknown) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

describe("scopeOfToken", () => {
  it("reads who authorised the hand-off, to pick the page's language only", () => {
    expect(scopeOfToken(jwt({ scope: "studio" }))).toBe("studio");
    expect(scopeOfToken(jwt({ scope: "platform" }))).toBe("platform");
  });

  it("is null for anything else, so the page stays English", () => {
    expect(scopeOfToken(jwt({ scope: "admin" }))).toBeNull();
    expect(scopeOfToken(jwt({}))).toBeNull();
    expect(scopeOfToken("not-a-token")).toBeNull();
    expect(scopeOfToken("a.%%%.c")).toBeNull();
    expect(scopeOfToken(null)).toBeNull();
  });
});
