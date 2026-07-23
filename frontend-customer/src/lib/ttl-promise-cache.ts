// In-memory TTL cache for async lookups, used to keep per-navigation server
// work (e.g. the auth /users/me/ round-trip) off the critical path. Caches the
// promise itself so concurrent callers share one in-flight request; null
// results and rejections are never cached, so transient failures don't stick.

type Entry<T> = { promise: Promise<T | null>; expires: number };

export interface TtlPromiseCache<T> {
  get(key: string, fetcher: () => Promise<T | null>): Promise<T | null>;
  clear(): void;
}

export function createTtlPromiseCache<T>({
  ttlMs,
  maxEntries = 200,
}: {
  ttlMs: number;
  maxEntries?: number;
}): TtlPromiseCache<T> {
  const entries = new Map<string, Entry<T>>();

  const drop = (key: string, entry: Entry<T>) => {
    if (entries.get(key) === entry) entries.delete(key);
  };

  return {
    get(key, fetcher) {
      const hit = entries.get(key);
      if (hit && hit.expires > Date.now()) return hit.promise;

      const entry: Entry<T> = {
        expires: Date.now() + ttlMs,
        promise: fetcher().then(
          (value) => {
            if (value === null) drop(key, entry);
            return value;
          },
          (err) => {
            drop(key, entry);
            throw err;
          },
        ),
      };

      entries.delete(key);
      entries.set(key, entry);
      for (const [k, e] of entries) {
        if (entries.size <= maxEntries && e.expires > Date.now()) break;
        entries.delete(k);
      }
      return entry.promise;
    },
    clear() {
      entries.clear();
    },
  };
}
