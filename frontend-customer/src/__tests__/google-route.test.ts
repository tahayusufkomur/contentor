import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/google/route";

const call = () =>
  POST(
    new NextRequest("http://own.localhost/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ token: "jwt" }),
    }),
  );
const me = (body: object) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body)),
  );

describe("POST /api/auth/google (a site's sign-in)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "en,tr,de,pl"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("gives a creator the studio in their language, like a magic link does", async () => {
    me({ role: "owner", preferred_locale: "tr" });
    const res = await call();
    expect(res.cookies.get("contentor_access_token")?.value).toBe("jwt");
    expect(res.cookies.get("user-locale")?.value).toBe("tr");
  });

  it("leaves a student's language to the site", async () => {
    me({ role: "student", preferred_locale: "de" });
    const res = await call();
    expect(res.cookies.get("contentor_access_token")?.value).toBe("jwt");
    expect(res.cookies.get("user-locale")).toBeUndefined();
  });

  it("still signs in when the language cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.cookies.get("contentor_access_token")?.value).toBe("jwt");
    expect(res.cookies.get("user-locale")).toBeUndefined();
  });
});
