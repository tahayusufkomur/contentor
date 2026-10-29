import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

let middleware: typeof import("@/middleware").default;
let config: typeof import("@/middleware").config;

beforeAll(async () => {
  // routing reads the enabled languages when it is first imported.
  vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "en,tr");
  ({ default: middleware, config } = await import("@/middleware"));
});

const get = (path: string, cookie?: string) =>
  middleware(
    new NextRequest(`http://localhost${path}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
const setCookie = (res: Response) => res.headers.get("set-cookie") ?? "";

describe("middleware cookie", () => {
  it("writes the page's language on a page response", () => {
    expect(setCookie(get("/tr/pricing"))).toContain("NEXT_LOCALE=tr");
    expect(setCookie(get("/pricing"))).toContain("NEXT_LOCALE=en");
  });

  it("leaves a cookie that is already right alone", () => {
    expect(setCookie(get("/tr/pricing", "NEXT_LOCALE=tr"))).toBe("");
  });

  it("keeps English when it is chosen from /en/..., so the redirect sticks", () => {
    const res = get("/en/pricing?x=1", "NEXT_LOCALE=tr");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/pricing?x=1");
    expect(setCookie(res)).toContain("NEXT_LOCALE=en");
  });

  it("does not claim English for an unprefixed address the cookie redirects", () => {
    const res = get("/pricing", "NEXT_LOCALE=tr");
    expect(res.headers.get("location")).toBe("http://localhost/tr/pricing");
    expect(setCookie(res)).toBe("");
  });
});

describe("middleware matcher", () => {
  const re = {
    test: (p: string) => new RegExp(`^${config.matcher[0]}$`).test(p),
  };
  it("covers pages", () => {
    for (const p of ["/", "/pricing", "/tr/blog/x", "/administrators"])
      expect(re.test(p), p).toBe(true);
  });
  it("skips the superadmin panel, the API, Next internals and files", () => {
    for (const p of [
      "/admin",
      "/admin/tenants",
      "/api/health",
      "/_next/static/a.js",
      "/og.jpg",
      "/sitemap.xml",
    ])
      expect(re.test(p), p).toBe(false);
  });
});
