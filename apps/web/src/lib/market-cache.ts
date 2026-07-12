type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  staleUntil: number;
};

type CacheOptions = {
  ttlMs: number;
  staleMs?: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

export async function getOrSetCache<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();

  const cached = cache.get(key) as
    | CacheEntry<T>
    | undefined;

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingRequest = pending.get(key) as
    | Promise<T>
    | undefined;

  if (existingRequest) {
    return existingRequest;
  }

  const request = loader()
    .then((data) => {
      const staleMs = Math.max(
        options.staleMs ?? options.ttlMs * 5,
        options.ttlMs
      );

      const currentTime = Date.now();

      cache.set(key, {
        data,
        expiresAt: currentTime + options.ttlMs,
        staleUntil: currentTime + staleMs,
      });

      return data;
    })
    .catch((error) => {
      const staleEntry = cache.get(key) as
        | CacheEntry<T>
        | undefined;

      if (
        staleEntry &&
        staleEntry.staleUntil > Date.now()
      ) {
        console.warn(
          `Cache loader failed for ${key}; returning stale data.`,
          error
        );

        return staleEntry.data;
      }

      throw error;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);

  return request;
}

export function getCachedValue<T>(
  key: string
): T | null {
  const cached = cache.get(key) as
    | CacheEntry<T>
    | undefined;

  return cached?.data ?? null;
}

export function deleteCachedValue(key: string) {
  cache.delete(key);
  pending.delete(key);
}

export function clearMarketCache() {
  cache.clear();
  pending.clear();
}

export function getMarketCacheStats() {
  return {
    entries: cache.size,
    pendingRequests: pending.size,
  };
}