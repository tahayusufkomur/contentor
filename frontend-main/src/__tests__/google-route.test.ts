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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("still signs in when the language cannot be read, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("could not read preferred_locale"),
      expect.any(Error),
    );
  });

  it("logs the status when the language lookup is refused", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 502 })),
    );
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).user.preferred_locale).toBe("");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("answered"), 502);
  });
});
