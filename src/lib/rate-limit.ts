/**
 * In-memory rate limiter — best-effort, per-instance.
 *
 * KNOWN LIMITATION: on Vercel serverless (and any horizontally-scaled runtime),
 * each instance maintains its own counters in a process-local Map. A request
 * that is rate-limited on instance A will be allowed again on instance B. This
 * is a deliberate trade-off to avoid introducing an external dependency
 * (Upstash Redis, KV, etc.) for a small platform.
 *
 * A future improvement would swap the `Map<string, number[]>` for a distributed
 * store (Upstash Redis REST) without changing the function signatures — the
 * contract here is `RateLimitOptions` / `RateLimitResult`.
 *
 * Usage:
 *   const r = rateLimitFromRequest(req, 'waitlist-signup', { windowMs: 60_000, max: 5 });
 *   if (!r.allowed) return new Response('rate limited', { status: 429, headers: { 'Retry-After': String(Math.ceil(r.retryAfterMs / 1000)) } });
 *
 * The key namespace combines the endpoint name with the client IP, so a single
 * IP cannot exhaust a global budget across endpoints.
 */
interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within the window. */
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the oldest request in the window falls out, freeing a slot. */
  retryAfterMs: number;
}

const buckets = new Map<string, number[]>();

function prune(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  // Mutate-in-place is fine — caller passes the array from the map.
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  return timestamps;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  prune(arr, now, opts.windowMs);

  if (arr.length >= opts.max) {
    const oldest = arr[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + opts.windowMs - now);
    // Persist the (pruned) array so the next call sees the same counters.
    buckets.set(key, arr);
    return { allowed: false, retryAfterMs };
  }

  arr.push(now);
  buckets.set(key, arr);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Convenience wrapper that derives a key from the request's client IP plus an
 * endpoint name. The IP is read from `x-forwarded-for` (Vercel sets this) or
 * `x-real-ip`, falling back to `'unknown'` for local/oddly-proxied traffic.
 */
export function rateLimitFromRequest(
  req: Request,
  endpoint: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const xff = req.headers.get('x-forwarded-for');
  const ip = (xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown').trim();
  return rateLimit(`${endpoint}:${ip}`, opts);
}

/**
 * Test-only escape hatch — clears all buckets. NOT exported via the public
 * surface used by routes; only imported by tests if they need to reset state.
 */
export function __resetRateLimiterForTests(): void {
  buckets.clear();
}
