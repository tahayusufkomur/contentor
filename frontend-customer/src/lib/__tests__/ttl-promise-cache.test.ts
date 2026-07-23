import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTtlPromiseCache } from "@/lib/ttl-promise-cache";

describe("createTtlPromiseCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches a resolved value within the TTL", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    const fetcher = vi.fn(async () => "user");

    await expect(cache.get("k", fetcher)).resolves.toBe("user");
    await expect(cache.get("k", fetcher)).resolves.toBe("user");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight lookups", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(
      () => new Promise<string>((r) => { resolve = r; }),
    );

    const a = cache.get("k", fetcher);
    const b = cache.get("k", fetcher);
    resolve("user");
    await expect(a).resolves.toBe("user");
    await expect(b).resolves.toBe("user");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    const fetcher = vi.fn(async () => "user");

    await cache.get("k", fetcher);
    vi.setSystemTime(1001);
    await cache.get("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache null results", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    const fetcher = vi.fn(async () => null);

    await expect(cache.get("k", fetcher)).resolves.toBeNull();
    await expect(cache.get("k", fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejections", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    const fetcher = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("user");

    await expect(cache.get("k", fetcher)).rejects.toThrow("boom");
    await expect(cache.get("k", fetcher)).resolves.toBe("user");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keys entries independently", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000 });
    const fetcher = vi.fn(async () => "user");

    await cache.get("a", fetcher);
    await cache.get("b", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry beyond maxEntries", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 10_000, maxEntries: 2 });
    const fetcher = vi.fn(async () => "user");

    await cache.get("a", fetcher);
    await cache.get("b", fetcher);
    await cache.get("c", fetcher); // evicts "a"
    await cache.get("b", fetcher); // still cached
    await cache.get("a", fetcher); // refetches
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("clear() empties the cache", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 10_000 });
    const fetcher = vi.fn(async () => "user");

    await cache.get("k", fetcher);
    cache.clear();
    await cache.get("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
