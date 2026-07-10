import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantUnavailable, streamAssistantChat } from "@/lib/assistant";

// Regression coverage for a review finding: a mid-chat `session_limit`
// response must surface as a typed, catchable error (so the widget can show
// an inline message) rather than a plain untyped Error indistinguishable
// from every other gated reason. `AssistantUnavailable.reason` is the
// contract the bubble's catch block relies on to pick `t("sessionLimit")`
// over the generic `t("error")` without touching the shared status store —
// see the `broadcast` guard in streamAssistantChat itself for the other
// half of that fix (not exercised here since the module keeps `statusCache`
// private; this repo's convention is pure-logic lib tests, not React/hook
// tests, so the "does the widget stay mounted" half is verified by code
// reading + the report's trace, not a unit test).
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

describe("streamAssistantChat gating", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws AssistantUnavailable(reason: session_limit) for a per-visitor cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ enabled: false, reason: "session_limit" }),
        ),
    );
    let caught: unknown;
    try {
      await streamAssistantChat([{ role: "user", content: "hi" }], () => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AssistantUnavailable);
    expect((caught as AssistantUnavailable).reason).toBe("session_limit");
  });

  it("throws AssistantUnavailable carrying the server's reason for a tenant-wide gate", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ enabled: false, reason: "quota" })),
    );
    let caught: unknown;
    try {
      await streamAssistantChat([{ role: "user", content: "hi" }], () => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AssistantUnavailable);
    expect((caught as AssistantUnavailable).reason).toBe("quota");
  });
});
