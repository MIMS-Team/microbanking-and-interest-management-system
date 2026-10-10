/**
 * Sliding-Window Rate Limiting Engine for Authentication & Banking Endpoints
 * 
 * Accurately calculates rolling request frequency across a sliding time window (windowMs)
 * rather than arbitrary fixed time intervals.
 * 
 * Bounded memory usage prevents memory leaks via LRU eviction and automatic TTL pruning.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

export interface RateLimitStore {
  getTimestamps(key: string, windowStart: number): number[];
  recordAttempt(key: string, timestamp: number): void;
  deleteKey(key: string): void;
  clear(): void;
  size(): number;
}

/**
 * In-memory sliding-window store with LRU eviction and memory bounds.
 */
class BoundedMemorySlidingStore implements RateLimitStore {
  private readonly store = new Map<string, number[]>();
  private readonly maxKeys: number;
  private lastPrune = Date.now();
  private readonly pruneIntervalMs = 60000; // 1 minute

  constructor(maxKeys = 10000) {
    this.maxKeys = maxKeys;
  }

  getTimestamps(key: string, windowStart: number): number[] {
    this.maybePrune();
    const list = this.store.get(key);
    if (!list) return [];
    // Keep only timestamps within the active sliding window
    const active = list.filter((ts) => ts >= windowStart);
    if (active.length === 0) {
      this.store.delete(key);
      return [];
    }
    this.store.set(key, active);
    return active;
  }

  recordAttempt(key: string, timestamp: number): void {
    let list = this.store.get(key);
    if (!list) {
      if (this.store.size >= this.maxKeys) {
        // Evict oldest inserted key to bound memory
        const firstKey = this.store.keys().next().value;
        if (firstKey) this.store.delete(firstKey);
      }
      list = [];
    }
    list.push(timestamp);
    this.store.set(key, list);
  }

  deleteKey(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private maybePrune(): void {
    const now = Date.now();
    if (now - this.lastPrune < this.pruneIntervalMs) return;
    this.lastPrune = now;

    // Prune buckets with no timestamps in the last 1 hour
    const cutoff = now - 3600000;
    for (const [key, timestamps] of this.store.entries()) {
      const recent = timestamps.filter((t) => t >= cutoff);
      if (recent.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, recent);
      }
    }
  }
}

let activeStore: RateLimitStore = new BoundedMemorySlidingStore();

export function setRateLimitStoreForTest(store: RateLimitStore): void {
  activeStore = store;
}

/**
 * Checks and records an attempt for the given key using true sliding-window logs.
 * 
 * @param key Unique key for rate limiting (e.g., `login:ip:127.0.0.1` or `login:email:user@bank.com`)
 * @param maxAttempts Maximum attempts allowed in the time window
 * @param windowMs Time window in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = activeStore.getTimestamps(key, windowStart);

  if (timestamps.length >= maxAttempts) {
    const oldest = timestamps[0] ?? windowStart;
    const resetInMs = Math.max(1000, oldest + windowMs - now);
    const resetInSeconds = Math.ceil(resetInMs / 1000);

    return {
      allowed: false,
      limit: maxAttempts,
      remaining: 0,
      resetInSeconds,
    };
  }

  activeStore.recordAttempt(key, now);
  const remaining = Math.max(0, maxAttempts - (timestamps.length + 1));
  const oldest = timestamps[0] ?? now;
  const resetInMs = Math.max(1000, oldest + windowMs - now);

  return {
    allowed: true,
    limit: maxAttempts,
    remaining,
    resetInSeconds: Math.ceil(resetInMs / 1000),
  };
}

/**
 * Resets a specific key (useful after successful verification or during testing)
 */
export function resetRateLimitKey(key: string): void {
  activeStore.deleteKey(key);
}

/**
 * Clears all rate limit records (primarily for testing purposes)
 */
export function clearAllRateLimits(): void {
  activeStore.clear();
}

/**
 * Rate limit configuration profiles
 */
export const RATE_LIMIT_CONFIGS = {
  // Normal protections are independent of headers and obsolete test flags.
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
  // OTP Verification: 5 attempts per 15 minutes
  OTP: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
  // Resend cooldown is never relaxed, including browser tests.
  OTP_RESEND: {
    maxAttempts: 1,
    windowMs: 30 * 1000,
  },
  // Password Reset Request: 3 requests per 15 minutes
  PASSWORD_RESET_REQUEST: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000,
  },
  // Password Reset Confirm: 5 attempts per 15 minutes
  PASSWORD_RESET_CONFIRM: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
};
