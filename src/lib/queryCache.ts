interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fetcher()
    .then((result) => {
      cache.set(key, { data: result, expiresAt: Date.now() + ttlMs });
      inflight.delete(key);
      return result;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(...prefixes: string[]): void {
  if (prefixes.length === 0) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      cache.delete(key);
    }
  }
}

export function clearAllCache(): void {
  cache.clear();
  inflight.clear();
}
