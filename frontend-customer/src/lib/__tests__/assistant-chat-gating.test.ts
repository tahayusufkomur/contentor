import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssistantUnavailable,
  getCachedAssistantStatus,
  refreshAssistantStatus,
  streamAssistantChat,
  type AssistantStatus,
} from "@/lib/assistant";

// Regression coverage for a review finding: a mid-chat `session_limit`
// response must surface as a typed, catchable error (so the widget can show
// an inline message) rather than a plain untyped Error indistinguishable
// from every other gated reason. `AssistantUnavailable.reason` is the
// contract the bubble's catch block relies on to pick `t("sessionLimit")`
// over the generic `t("error")` without touching the shared status store.
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

describe("streamAssistantChat / shared status store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const BASE_STATUS: AssistantStatus = {
    enabled: true,
    reason: "ok",
    greeting: "hi",
    suggested_questions: [],
    brand: "Acme",
    human_handoff: true,
    link_whitelist: [],
  };

  it("leaves the shared status cache untouched for session_limit but flips it for a tenant-wide gate", async () => {
    // Prime the cache the same way useAssistantStatus() does on mount.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(BASE_STATUS)),
    );
    await refreshAssistantStatus();
    expect(getCachedAssistantStatus()).toEqual(BASE_STATUS);

    // session_limit is a per-visitor cap — must NOT touch the shared cache,
    // otherwise every mounted widget's useAssistantStatus() would flip
    // enabled:false and unmount, per the bug this guards against.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ enabled: false, reason: "session_limit" }),
        ),
    );
    await expect(
      streamAssistantChat([{ role: "user", content: "hi" }], () => {}),
    ).rejects.toBeInstanceOf(AssistantUnavailable);
    expect(getCachedAssistantStatus()).toEqual(BASE_STATUS);

    // quota is a genuine tenant-wide gate — DOES collapse the shared cache,
    // same as before this fix.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ enabled: false, reason: "quota" })),
    );
    await expect(
      streamAssistantChat([{ role: "user", content: "hi" }], () => {}),
    ).rejects.toBeInstanceOf(AssistantUnavailable);
    const after = getCachedAssistantStatus();
    expect(after?.enabled).toBe(false);
    expect(after?.reason).toBe("quota");
  });
});
