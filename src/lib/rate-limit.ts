/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Limitation: this only protects a single Node.js process. For a
 * multi-instance Vercel deployment, replace this with a shared store
 * (e.g. Upstash Redis `@upstash/ratelimit`) using the same interface.
 * For an event of ~100 teams run from one Next.js server process (the
 * typical "one booth laptop runs the backend" deployment, or a single
 * Vercel serverless region with low concurrency) this is sufficient.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

// Periodically sweep expired buckets so the map doesn't grow unbounded.
if (!(globalThis as typeof globalThis & { __gtmRateLimitSweep?: boolean }).__gtmRateLimitSweep) {
  (globalThis as typeof globalThis & { __gtmRateLimitSweep?: boolean }).__gtmRateLimitSweep = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000).unref?.();
}
