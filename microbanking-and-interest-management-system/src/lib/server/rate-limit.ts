/**
 * Rate Limiting Middleware for Authentication Endpoints
 * 
 * Protects against brute-force attacks, credential stuffing, and OTP flooding
 * by tracking attempts within a rolling time window.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// In-memory sliding window storage (keyed by namespace + identifier)
const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Checks and records an attempt for the given key.
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
  const bucket = rateLimitStore.get(key);

  if (!bucket || now >= bucket.resetAt) {
    // Window expired or new key
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: Math.max(0, maxAttempts - 1),
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  // Window is active
  if (bucket.count >= maxAttempts) {
    const remainingSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return {
      allowed: false,
      limit: maxAttempts,
      remaining: 0,
      resetInSeconds: remainingSeconds > 0 ? remainingSeconds : 1,
    };
  }

  bucket.count += 1;
  const remainingSeconds = Math.ceil((bucket.resetAt - now) / 1000);
  return {
    allowed: true,
    limit: maxAttempts,
    remaining: Math.max(0, maxAttempts - bucket.count),
    resetInSeconds: remainingSeconds > 0 ? remainingSeconds : 1,
  };
}

/**
 * Resets a specific key (useful after successful verification or during testing)
 */
export function resetRateLimitKey(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clears all rate limit records (primarily for testing purposes)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Rate limit configuration profiles
 */
export const RATE_LIMIT_CONFIGS = {
  // Login: 5 attempts per 15 minutes per IP/email
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
  // OTP Verification: 5 attempts per 15 minutes
  OTP: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
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
