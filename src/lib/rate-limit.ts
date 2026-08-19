/**
 * Rate limiter — uses the RateLimitStore abstraction.
 *
 * The default store is InMemoryRateLimitStore (per-instance, NOT production-grade).
 * A future SharedRateLimitStore (Redis/Upstash) can be injected via
 * setRateLimitStore() without changing call sites.
 *
 * Usage:
 *   const r = rateLimitFromRequest(req, 'waitlist-signup', { windowMs: 60_000, max: 5 });
 *   if (!r.allowed) return new Response('rate limited', { status: 429, headers: { 'Retry-After': String(Math.ceil(r.retryAfterMs / 1000)) } });
 *
 * The key namespace combines the endpoint name with the client IP, so a single
 * IP cannot exhaust a global budget across endpoints.
 */
import { getRateLimitStore, type RateLimitOptions, type RateLimitResult } from '@/lib/rate-limit-store';

export type { RateLimitOptions, RateLimitResult };

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  return getRateLimitStore().check(key, opts);
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
