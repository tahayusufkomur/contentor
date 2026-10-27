import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../middleware";

// The header the (public) layout reads, as Next hands request-header
// overrides on: `x-middleware-request-<name>`, or absent when not set.
const embedFor = (url: string, headers: Record<string, string> = {}) =>
  middleware(
    new NextRequest(url, { headers: { host: "studio.localhost", ...headers } }),
  ).headers.get("x-middleware-request-x-embed");

describe("middleware x-embed", () => {
  it("passes ?embed=1 (the plain preview) and ?embed=edit (the full editor)", () => {
    expect(embedFor("http://studio.localhost/?embed=1")).toBe("1");
    expect(embedFor("http://studio.localhost/plans?embed=edit")).toBe("edit");
  });

  it("sets nothing for any other value or none", () => {
    expect(embedFor("http://studio.localhost/")).toBeNull();
    expect(embedFor("http://studio.localhost/?embed=yes")).toBeNull();
    expect(embedFor("http://studio.localhost/?embed=EDIT")).toBeNull();
  });

  it("never trusts an x-embed header sent by the browser", () => {
    expect(
      embedFor("http://studio.localhost/", { "x-embed": "edit" }),
    ).toBeNull();
    expect(
      embedFor("http://studio.localhost/?embed=1", { "x-embed": "edit" }),
    ).toBe("1");
  });
});
