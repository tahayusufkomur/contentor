// retryTransient / isTransientApiError: a rate-limited (429) or transiently
// failing (5xx / network) fetch must be retried briefly instead of surfacing
// as a hard failure — the community gate once rendered a 429 as "this
// community hasn't been switched on yet". Deliberate API outcomes (403, 404)
// must pass through untouched, first try.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTransientApiError, retryTransient } from "@/lib/api-client";
import { ApiError } from "@/types/api";

describe("isTransientApiError", () => {
  it("treats 429 and 5xx ApiErrors as transient", () => {
    expect(isTransientApiError(new ApiError(429, {}))).toBe(true);
    expect(isTransientApiError(new ApiError(500, {}))).toBe(true);
    expect(isTransientApiError(new ApiError(503, {}))).toBe(true);
  });

  it("treats deliberate API outcomes as non-transient", () => {
    expect(isTransientApiError(new ApiError(403, {}))).toBe(false);
    expect(isTransientApiError(new ApiError(404, {}))).toBe(false);
    expect(isTransientApiError(new ApiError(400, {}))).toBe(false);
  });

  it("treats fetch network failures (TypeError) as transient, other throwables not", () => {
    expect(isTransientApiError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientApiError(new Error("boom"))).toBe(false);
    expect(isTransientApiError("string")).toBe(false);
  });
});

describe("retryTransient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first success without waiting", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryTransient(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once after a transient failure and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, {}))
      .mockResolvedValueOnce("ok");
    const p = retryTransient(fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-transient errors immediately without retrying", async () => {
    const banned = new ApiError(403, {});
    const fn = vi.fn().mockRejectedValue(banned);
    await expect(retryTransient(fn)).rejects.toBe(banned);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget and rethrows the last error", async () => {
    const limited = new ApiError(429, {});
    const fn = vi.fn().mockRejectedValue(limited);
    const p = retryTransient(fn);
    p.catch(() => {}); // avoid unhandled-rejection noise while timers run
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBe(limited);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After hint so a page gate never hangs behind it", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, {}, 60))
      .mockResolvedValueOnce("ok");
    const p = retryTransient(fn);
    // The middleware sends Retry-After: 60 — the helper must wait the cap
    // (3s), not a full minute.
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
