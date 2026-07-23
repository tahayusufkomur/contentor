import { describe, expect, it, vi } from "vitest";
import { createAsyncRunner, errorMessage } from "@shared/hooks/async-runner";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createAsyncRunner", () => {
  it("toggles loading around a successful action and calls onSuccess", async () => {
    const setLoading = vi.fn();
    const onSuccess = vi.fn();
    const d = deferred();
    const run = createAsyncRunner(() => d.promise, { setLoading, onSuccess });

    const p = run();
    expect(setLoading).toHaveBeenLastCalledWith(true);
    d.resolve();
    await p;
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("ignores re-invocation while in flight (double-submit guard)", async () => {
    const d = deferred();
    const fn = vi.fn(() => d.promise);
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });

    const p1 = run();
    const p2 = run(); // must be swallowed
    d.resolve();
    await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("routes errors to onError, resets loading, and does not rethrow", async () => {
    const setLoading = vi.fn();
    const onError = vi.fn();
    const boom = new Error("boom");
    const run = createAsyncRunner(() => Promise.reject(boom), {
      setLoading,
      onError,
    });

    await expect(run()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("allows a new invocation after the previous one settles", async () => {
    const fn = vi.fn(() => Promise.resolve());
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });
    await run();
    await run();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes arguments through to fn", async () => {
    const fn = vi.fn((_a: number, _b: string) => Promise.resolve());
    const run = createAsyncRunner(fn, { setLoading: vi.fn() });
    await run(7, "x");
    expect(fn).toHaveBeenCalledWith(7, "x");
  });
});

describe("errorMessage", () => {
  it("uses Error.message when present", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
  });
  it("falls back for non-Error values and empty messages", () => {
    expect(errorMessage("weird")).toBe("Something went wrong");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
