/**
 * In-Memory Client-Side API Cache with In-Flight Deduplication & Stale Handling.
 * Eliminates redundant network roundtrips when navigating between tabs
 * (e.g. Dashboard -> Vocabulary -> Assignments -> Dashboard).
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class ApiMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();

  /**
   * Generates a stable normalized cache key from endpoint and optional query params.
   */
  public makeKey(url: string, params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }
    const cleanParams: Record<string, any> = {};
    for (const key of Object.keys(params).sort()) {
      const val = params[key];
      if (val !== undefined && val !== null) {
        cleanParams[key] = val;
      }
    }
    return `${url}?${JSON.stringify(cleanParams)}`;
  }

  /**
   * Return cached item if available and unexpired.
   */
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Store data in cache with a TTL (default 2 minutes = 120,000ms).
   */
  public set<T>(key: string, data: T, ttlMs: number = 120_000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidate cache entries matching a substring, regex, or clear all.
   */
  public invalidate(pattern?: string | RegExp): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of Array.from(this.cache.keys())) {
      if (typeof pattern === "string") {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      } else if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Fetch data with memory caching and in-flight deduplication.
   */
  public async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: { ttlMs?: number; forceRefresh?: boolean }
  ): Promise<T> {
    const ttl = options?.ttlMs ?? 120_000;

    if (!options?.forceRefresh) {
      const cached = this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    // In-flight deduplication: return existing promise if already in flight
    if (this.inflight.has(key)) {
      return this.inflight.get(key)! as Promise<T>;
    }

    const promise = fetcher()
      .then((data) => {
        this.set(key, data, ttl);
        this.inflight.delete(key);
        return data;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }
}

export const apiCache = new ApiMemoryCache();
