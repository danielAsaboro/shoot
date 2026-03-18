/**
 * Per-key sliding-window rate limiter for agent API endpoints.
 *
 * Read tools:    60 requests / minute
 * Trading tools: 10 requests / minute
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

const LIMITS = {
  read: { max: 60, windowMs: 60_000 },
  trade: { max: 10, windowMs: 60_000 },
} as const;

export type RateLimitTier = keyof typeof LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkAgentRateLimit(
  keyId: string,
  tier: RateLimitTier
): RateLimitResult {
  const { max, windowMs } = LIMITS[tier];
  const bucketKey = `${keyId}:${tier}`;
  const now = Date.now();

  const entry = windows.get(bucketKey);

  if (!entry || now > entry.resetAt) {
    windows.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= max) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}
