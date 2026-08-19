/**
 * RateLimitStore — abstraction over the rate-limit storage backend.
 *
 * Two implementations:
 *   - InMemoryRateLimitStore  — per-process Map. Works locally and on
 *                               Vercel serverless (per-instance). NOT a
 *                               reliable production security control because
 *                               an attacker can distribute requests across
 *                               instances. Marked explicitly as non-production.
 *   - SharedRateLimitStore    — stub for a future Redis/Upstash backend.
 *                               Throws "not implemented" so a misconfigured
 *                               production deployment fails loudly.
 *
 * The rest of the application depends on the RateLimitStore interface, not on
 * the in-memory implementation directly. This makes it trivial to swap in a
 * shared store later without touching call sites.
 */

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  /** Number of requests recorded in the current window (for observability). */
  count: number;
}

export interface RateLimitStore {
  check(key: string, opts: RateLimitOptions): RateLimitResult;
}

// -----------------------------------------------------------------------------
// InMemoryRateLimitStore
// -----------------------------------------------------------------------------

export class InMemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>();

  check(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const windowStart = now - opts.windowMs;
    const existing = this.hits.get(key) ?? [];
    const inWindow = existing.filter((t) => t > windowStart);
    if (inWindow.length >= opts.max) {
      const oldest = inWindow[0]!;
      const retryAfterMs = oldest + opts.windowMs - now;
      this.hits.set(key, inWindow);
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs), count: inWindow.length };
    }
    inWindow.push(now);
    this.hits.set(key, inWindow);
    return { allowed: true, retryAfterMs: 0, count: inWindow.length };
  }
}

// -----------------------------------------------------------------------------
// SharedRateLimitStore (stub — future Redis/Upstash implementation)
// -----------------------------------------------------------------------------

export class SharedRateLimitStore implements RateLimitStore {
  check(_key: string, _opts: RateLimitOptions): RateLimitResult {
    throw new Error(
      'SharedRateLimitStore is not yet implemented. Configure an InMemoryRateLimitStore for development, ' +
        'or implement Redis/Upstash backing before relying on rate limiting in production.',
    );
  }
}

// -----------------------------------------------------------------------------
// Singleton factory
// -----------------------------------------------------------------------------

let defaultStore: RateLimitStore | null = null;

/**
 * Returns the default rate-limit store. In development and on Vercel preview
 * deployments, this is an InMemoryRateLimitStore (with a console warning
 * about its per-instance limitation). In production, a future deployment can
 * inject a SharedRateLimitStore via setRateLimitStore().
 */
export function getRateLimitStore(): RateLimitStore {
  if (defaultStore) return defaultStore;
  // Default: in-memory. This is explicitly NOT production-grade.
  // A future improvement will detect production and require a shared store.
  if (process.env.NODE_ENV === 'production' && !process.env.RATE_LIMIT_ALLOW_IN_MEMORY) {
    console.warn(
      '[rate-limit] Using InMemoryRateLimitStore in production. This is per-instance and NOT a reliable security control. Set RATE_LIMIT_ALLOW_IN_MEMORY=1 to acknowledge, or implement SharedRateLimitStore.',
    );
  }
  defaultStore = new InMemoryRateLimitStore();
  return defaultStore;
}

export function setRateLimitStore(store: RateLimitStore): void {
  defaultStore = store;
}
