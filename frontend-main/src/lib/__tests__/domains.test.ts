import { afterEach, describe, expect, it, vi } from "vitest";
import { removeDomain, searchDomains } from "@/lib/domains";

describe("domain API errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The backend's `detail` is English; callers show their translated message.
  it("never carries the backend's English text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Domain is not available." }), {
            status: 409,
          }),
      ),
    );
    await expect(searchDomains("s", "h", "q")).rejects.toThrow("HTTP 409");
    await expect(removeDomain("s", "h", 1)).rejects.toThrow("HTTP 409");
  });
});
