/**
 * Request rate limiting with a token bucket, per signed-in session (or per client address for the sign-in API).
 *
 * Every client has a bucket of RATE_LIMIT_CAPACITY tokens (default 60). Each API request takes one; the bucket refills
 * at RATE_LIMIT_PER_SECOND (default 1) and never holds more than its capacity. A normal user never empties it; a
 * script firing requests in a burst gets 60 and then one per second, so a burst can never be twice the limit (as it
 * can with a counter that resets each minute). An empty bucket answers 429 with Retry-After.
 *
 * The buckets live in this server's memory: each running instance limits on its own, and a restart refills them.
 */

export type BucketConfig = { capacity: number; perSecond: number };

export function bucketConfig(): BucketConfig {
  const capacity = Number(process.env.RATE_LIMIT_CAPACITY);
  const perSecond = Number(process.env.RATE_LIMIT_PER_SECOND);
  return {
    capacity: Number.isFinite(capacity) && capacity >= 1 ? Math.floor(capacity) : 60,
    perSecond: Number.isFinite(perSecond) && perSecond > 0 ? perSecond : 1,
  };
}

type Bucket = { tokens: number; at: number };
const g = globalThis as typeof globalThis & { __ktBuckets?: Map<string, Bucket> };
const buckets = (g.__ktBuckets ??= new Map());
let sweeps = 0;

export type Take = { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

/** Takes one token from `key`'s bucket, refilling it first for the time since it was last used. */
export function take(key: string, cfg: BucketConfig = bucketConfig(), now = Date.now()): Take {
  const b = buckets.get(key) ?? { tokens: cfg.capacity, at: now };
  b.tokens = Math.min(cfg.capacity, b.tokens + ((now - b.at) / 1000) * cfg.perSecond);
  b.at = now;
  buckets.set(key, b);
  // Now and then, forget buckets that have been full (idle) for a while, so memory stays small.
  if (++sweeps % 1000 === 0) {
    const idle = (cfg.capacity / cfg.perSecond) * 1000 + 60_000;
    for (const [k, x] of buckets) if (now - x.at > idle) buckets.delete(k);
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: Math.floor(b.tokens) };
  }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - b.tokens) / cfg.perSecond)) };
}

/** How many clients have a bucket now, and how many of them are empty (being held back). */
export function bucketStats(cfg: BucketConfig = bucketConfig(), now = Date.now()): { clients: number; limited: number } {
  let limited = 0;
  for (const b of buckets.values()) if (b.tokens + ((now - b.at) / 1000) * cfg.perSecond < 1) limited++;
  return { clients: buckets.size, limited };
}
