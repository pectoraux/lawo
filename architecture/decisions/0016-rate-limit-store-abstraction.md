# ADR 0016 — Rate Limit Store Abstraction

- **Status:** ACCEPTED
- **Date:** Authorization sprint (post-0011)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

ADR 0011 introduced in-memory rate limiting on the auth-sprint endpoints (sign-up, sign-in, set-password, waitlist approve/reject). The implementation was a simple `Map<key, timestamp[]>` in module scope, called via a `checkRateLimit(key, windowMs, max)` utility.

ADR 0011 documented the per-instance limitation explicitly:

> The limiter is **per-instance** — each Vercel serverless function invocation has its own `Map`. On Vercel, the same `Map` is reused across requests within a single warm instance, but a cold-start gives a fresh `Map`. ... A determined attacker could bypass the limit by hitting different Vercel instances (each instance has its own `Map`). With 5 requests per 60 seconds per instance and (say) 10 warm instances, the effective limit is ~50 requests per 60 seconds.

This was acceptable as a *first layer* for the auth sprint (small-admin-team, low-traffic, invitation-only access). It is **not** acceptable as a long-term production security control. A future improvement was foreshadowed: "migrate to Upstash Redis for distributed rate limiting. This would supersede this ADR (per section 36)."

The authorization sprint does *not* migrate to Upstash Redis — that is premature for the platform's current scale, and it would introduce a new external dependency (Upstash), a new environment variable, a new failure mode (what if Upstash is unreachable?), and a per-request latency cost. But the sprint *does* need to:

1. **Make the migration cheap when it happens.** If every call site inlines `new InMemoryRateLimitStore()` or imports the in-memory implementation directly, a future migration to Redis would require touching every call site. The migration should be a single-point change.
2. **Make the limitation explicit at runtime.** A deployment that uses in-memory rate limiting in production should *warn* in the logs, not silently use a non-production-grade control. An operator reading the logs should see "you are using InMemoryRateLimitStore; this is per-instance and NOT a reliable security control".
3. **Acknowledge the limitation via configuration.** A production deployment that *intentionally* accepts the per-instance limitation (e.g., a staging deployment, or a low-traffic production deployment that accepts the trade-off) should be able to acknowledge the limitation via an environment variable, suppressing the warning but documenting the acceptance.

This decision interacts with the rate-limiting decision (per ADR 0011 — this ADR does not supersede 0011; it adds an abstraction layer that 0011's implementation can be refactored into). It does not interact with any kernel invariant — rate limiting is a security-hardening concern, not an architectural one (per I18).

## Decision

**Abstract rate limiting behind a `RateLimitStore` interface with two implementations: `InMemoryRateLimitStore` (per-instance, NOT production-grade) and `SharedRateLimitStore` (stub for future Redis/Upstash). The application depends on the interface, not on the implementation.**

### The interface

```ts
// src/lib/rate-limit-store.ts

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
```

The interface is intentionally synchronous. An in-memory `check()` is a `Map.get` + filter + `Map.set` — microseconds. A future Redis-backed implementation may need to be async (a Redis `INCR` round-trip); the interface can be changed to `Promise<RateLimitResult>` in a future ADR (with migration of call sites). For now, the synchronous interface is the simpler choice — and the `SharedRateLimitStore` stub throws synchronously, which surfaces misconfiguration loudly.

### The implementations

1. **`InMemoryRateLimitStore`** — the existing in-memory algorithm, refactored into a class that implements `RateLimitStore`. Per-instance. NOT production-grade. The class has a private `Map<string, number[]>` and a `check(key, opts)` method that implements the sliding-window algorithm from ADR 0011. The behaviour is identical to the previous `checkRateLimit()` utility; only the wrapping changed.

2. **`SharedRateLimitStore`** — a stub that throws on `check()`:

   ```ts
   export class SharedRateLimitStore implements RateLimitStore {
     check(_key: string, _opts: RateLimitOptions): RateLimitResult {
       throw new Error(
         'SharedRateLimitStore is not yet implemented. Configure an InMemoryRateLimitStore for development, ' +
           'or implement Redis/Upstash backing before relying on rate limiting in production.',
       );
     }
   }
   ```

   The stub exists so that a future maintainer who configures `setRateLimitStore(new SharedRateLimitStore())` in production gets a loud failure on the first request, not a silent no-op. The error message tells the maintainer what to do (implement Redis/Upstash, or fall back to InMemory).

### The factory

```ts
let defaultStore: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (defaultStore) return defaultStore;
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
```

- `getRateLimitStore()` returns the default store. In development and on Vercel preview deployments, this is an `InMemoryRateLimitStore`. In production, it warns (unless `RATE_LIMIT_ALLOW_IN_MEMORY=1` is set, which acknowledges the limitation and suppresses the warning).
- `setRateLimitStore(store)` allows a future deployment (or a test) to inject a `SharedRateLimitStore` (or a mock) without touching the call sites. The injection is a single-point change at application startup (e.g., in `instrumentation.ts` or in a module-level initializer).

### Application

Call sites (the auth-sprint endpoints, plus any future endpoint that needs rate limiting) call `getRateLimitStore().check(key, opts)` instead of inlining `checkRateLimit(key, opts)`. The call site does not know whether the store is in-memory or shared; it knows only that the store returns a `RateLimitResult`.

```ts
// Example call site
import { getRateLimitStore } from '@/lib/rate-limit-store';

const store = getRateLimitStore();
const result = store.check(`signup:${ip}`, { windowMs: 60_000, max: 5 });
if (!result.allowed) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } },
  );
}
```

### What is explicitly NOT done

- **No Redis / Upstash integration in this ADR.** The `SharedRateLimitStore` is a stub. The integration is deferred to a future ADR (which would supersede this one's "stub" status for `SharedRateLimitStore`). The interface is designed to accommodate it.
- **No change to the rate-limit parameters (5/60s for public endpoints, 10/60s for admin endpoints).** These are per ADR 0011; this ADR does not change them.
- **No change to the rate-limit keys (IP for public endpoints, userId for admin endpoints).** Same — per ADR 0011.
- **No change to the response shape (429 with `Retry-After` header).** Same — per ADR 0011.
- **No new kernel primitives.** Rate limiting is a security concern, not a kernel concern (per I18). The `RateLimitStore` interface lives in `src/lib/`, not in `src/kernel/`.

## Alternatives considered

- **Add Upstash Redis now.** Rejected as premature: the platform's traffic is low (small-admin-team, invitation-only access). Upstash adds a new external dependency, a new environment variable, a new failure mode (what if Upstash is unreachable?), and a per-request latency cost (a Redis `INCR` round-trip on every rate-limited request). The per-instance limitation is acceptable for the current scale; the abstraction makes the migration cheap when the scale justifies it.
- **Remove rate limiting entirely.** Rejected: insecure. The auth-sprint endpoints would be trivially abusable (sign-up spam, sign-in brute-force, set-password token brute-force). Rate limiting is a defence-in-depth layer even with the per-instance limitation.
- **Use Vercel's Edge Middleware for rate limiting.** Rejected (per ADR 0011 — same reasoning): Edge Middleware runs on the Edge runtime, which has a different API surface from the Node runtime that the auth endpoints use. Writing the rate limiter in Edge Middleware would require duplicating the logic in two runtimes.
- **Use a third-party rate-limiting service (e.g., Cloudflare, Akamai).** Rejected as premature: the platform is not behind such a service. Adding one is a deployment-architecture decision, not an application-architecture decision. This ADR is about the application layer.
- **Make the interface async (`Promise<RateLimitResult>`).** Considered: an async interface would accommodate a Redis-backed implementation without a future breaking change. Rejected for now: the in-memory `check()` is synchronous and microseconds-fast; making it async would add a microtask hop on every rate-limited request for no current benefit. The interface can be changed to async in a future ADR (with migration of call sites). The `SharedRateLimitStore` stub throws synchronously, which is the loudest possible failure mode for a misconfigured production deployment.
- **Inject the store via a dependency-injection container.** Rejected: a DI container is overkill for the platform's scale. The `setRateLimitStore(store)` factory is sufficient — it is a single global, set once at application startup. (Tests can call `setRateLimitStore(new InMemoryRateLimitStore())` to reset state between tests.)

## Consequences

- **The call sites do not change when a shared store is added.** A future maintainer who implements `SharedRateLimitStore` (with Redis/Upstash) and calls `setRateLimitStore(new SharedRateLimitStore({...connection}))` at startup has migrated the platform to distributed rate limiting. No call site changes; no `grep`-and-replace; no missed sites.
- **The limitation is explicitly documented and acknowledged.** A production deployment that uses `InMemoryRateLimitStore` either sets `RATE_LIMIT_ALLOW_IN_MEMORY=1` (acknowledging the limitation) or sees a console warning on every cold start. An operator reading the logs cannot miss it.
- **The `SharedRateLimitStore` stub fails loudly.** A maintainer who accidentally configures `SharedRateLimitStore` in production (before implementing it) gets an error on the first rate-limited request, not a silent no-op. The error message tells them what to do.
- **The interface is small and stable.** `check(key, opts): RateLimitResult` is the entire surface. Adding a new method (e.g., `reset(key)` for testing) requires a future ADR; the surface is intentionally minimal.
- **The static architecture test suite is unchanged.** No new check is added (the abstraction is not a structural invariant — it is a code-organization choice). A future static check could verify that no call site imports `InMemoryRateLimitStore` directly (only `getRateLimitStore`); this is noted as a future improvement, not part of this ADR.
- **The runtime test suite is unaffected.** The runtime tests call the real endpoints, which call `getRateLimitStore().check(...)`. The tests use the default in-memory store (set via the factory). A future runtime test could exercise rate limiting by sending N+1 requests and asserting the N+1th returns 429 — this is already the case (per ADR 0011).
- **Future maintainers can swap the store without superseding this ADR.** The ADR records the *abstraction* decision. A future ADR that adds a Redis-backed `SharedRateLimitStore` implementation supersedes the *stub* status of `SharedRateLimitStore` (per the "Future revisions" line in this ADR's migration section), but the abstraction itself (`RateLimitStore` interface, `getRateLimitStore` / `setRateLimitStore` factory) is unchanged.

## Invariants affected

- **None directly.** This ADR is a security-hardening decision (per I18 — hardening sprints may improve implementation but may not redefine architecture). The kernel primitives, the rule engine, the state engine, the decision engine, and the contracts are unchanged.
- **ADR 0011's per-instance limitation is acknowledged, not removed.** The limitation is the same; this ADR makes the future migration cheap and the current limitation explicit. The future Upstash Redis ADR will supersede the limitation (per ADR 0011's "Future improvement" line and this ADR's "Future revisions" line).
- **I18** (hardening sprint may not redefine architecture): the kernel architecture is unchanged. This ADR records a code-organization choice that improves future maintainability.

## Migration implications

- `src/lib/rate-limit-store.ts` — **added**. Exports `RateLimitStore` (interface), `InMemoryRateLimitStore` (class), `SharedRateLimitStore` (stub class), `getRateLimitStore()` (factory), `setRateLimitStore()` (injection). The `RateLimitOptions` and `RateLimitResult` types are exported.
- `src/lib/rate-limit.ts` (or wherever the previous `checkRateLimit()` utility lived) — **refactored** to delegate to `getRateLimitStore().check(...)`. The previous `checkRateLimit()` utility is kept as a thin wrapper (for backward compatibility with call sites that have not yet migrated) or removed (if all call sites are migrated). The choice is an implementation detail; the ADR records only the abstraction.
- Call sites in `src/app/api/auth/signup/route.ts`, `src/app/api/auth/signin/route.ts`, `src/app/api/auth/set-password/route.ts`, `src/app/api/waitlist/approve/route.ts`, `src/app/api/waitlist/reject/route.ts` — updated to call `getRateLimitStore().check(...)` (or to continue calling the `checkRateLimit()` wrapper, which delegates).
- Environment variables: `RATE_LIMIT_ALLOW_IN_MEMORY` (optional; set to `1` in production to acknowledge the per-instance limitation and suppress the warning). If unset in production, the warning is logged on every cold start.
- Existing rate-limit behaviour is unchanged for callers. The same keys, the same windows, the same limits, the same 429 response. The abstraction is invisible to the client.
- The runtime test suite is unaffected (it exercises the real endpoints, which call the factory, which returns the in-memory store).
- Future revisions (e.g., implementing `SharedRateLimitStore` with Redis/Upstash, making the interface async, adding a static check for direct `InMemoryRateLimitStore` imports) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 25 (security), section 31 (I18).
- `decisions/0011-rate-limiting-and-csrf.md` — the rate-limiting decision this ADR abstracts. ADR 0011's per-instance limitation is the motivation for this ADR.
- `architecture/invariants.md` — I18 (hardening sprints may improve implementation but may not redefine architecture).
- `src/lib/rate-limit-store.ts` — the `RateLimitStore` interface, the two implementations, and the `getRateLimitStore` / `setRateLimitStore` factory.
- `src/lib/rate-limit.ts` — the `checkRateLimit()` utility that delegates to the factory.
- `worklog.md` — HARDENING-SPRINT-REPORT "Architecture Conflicts" section, known limitation 1 (the per-instance rate-limit limitation this ADR makes explicit and abstracts).
