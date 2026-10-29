import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/google/route";

const call = () =>
  POST(
    new NextRequest("http://localhost/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ token: "jwt" }),
    }),
  );

describe("POST /api/auth/google", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets the session and says which language the creator reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ preferred_locale: "tr" })),
    );
    const res = await call();
    expect(await res.json()).toEqual({
      ok: true,
      user: { preferred_locale: "tr" },
    });
    expect(res.headers.get("set-cookie")).toContain("jwt");
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
    expect((await res.json()).user.preferred_locale).toBe("");
    expect(res.headers.get("set-cookie")).toContain("jwt");
  });
});
