# ADR 0011 — In-Memory Rate Limiting + Origin-Header CSRF Checks

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005) — SEC-6 hardening
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The auth sprint introduced several public-facing POST endpoints:

- `/api/auth/signup` — public; creates a `WaitlistEntry` (ADR 0008)
- `/api/auth/signin` — NextAuth's Credentials provider sign-in (ADR 0007)
- `/api/auth/set-password` — public; sets a user's password given a valid invitation token (ADR 0009)
- `/api/waitlist/approve`, `/api/waitlist/reject` — admin-only; approve/reject a waitlist entry (ADR 0008)

These endpoints need protection against two broad threat classes:

1. **Brute-force / abuse** — an attacker can spam sign-ups (filling the waitlist with junk), brute-force passwords on sign-in, or brute-force invitation tokens on set-password. Without rate limiting, these attacks are bounded only by the attacker's request rate.
2. **Cross-Site Request Forgery (CSRF)** — a malicious site can embed a form that POSTs to `/api/auth/set-password` (or any other state-changing endpoint) and trick an authenticated user's browser into submitting it. The browser sends the user's cookies automatically; the attacker does not need to read the response, only to trigger the side-effect. Without CSRF protection, the attacker can set an attacker-chosen password on the user's account (in the set-password case) or approve arbitrary waitlist entries (in the admin case, if the admin is tricked).

NextAuth v4 has built-in CSRF protection for its own endpoints (`/api/auth/*`), but **custom POST endpoints** (`/api/waitlist/approve`, `/api/waitlist/reject`, `/api/auth/set-password`) are not covered by NextAuth's CSRF middleware — they need their own check.

This is a **security hardening** decision, not an architectural one. The kernel primitives, the rule engine, the state engine, and the decision engine are unaffected (per I18). The decision interacts with capability enforcement (per I12) only in the sense that a CSRF-protected endpoint is one that refuses unauthorised callers — but CSRF protection is a transport-level concern, not a capability-system concern.

## Decision

Adopt two layers of protection on the auth-sprint endpoints:

### 1. In-memory rate limiting (per-instance)

A simple in-memory rate limiter: `Map<key, timestamp[]>` where the key is the caller's identifier (IP address for public endpoints, `userId` for admin endpoints) and the value is a sliding window of request timestamps.

- **Public endpoints** (`/api/auth/signup`, `/api/auth/signin`, `/api/auth/set-password`): 5 requests per 60 seconds per IP.
- **Admin endpoints** (`/api/waitlist/approve`, `/api/waitlist/reject`): 10 requests per 60 seconds per `userId`.

The limiter is implemented as a small utility (`checkRateLimit(key, windowMs, max)` returning a boolean). It runs at the start of every protected endpoint. If the limit is exceeded, the endpoint returns 429 Too Many Requests.

The limiter is **per-instance** — each Vercel serverless function invocation has its own `Map`. On Vercel, the same `Map` is reused across requests within a single warm instance, but a cold-start gives a fresh `Map`. See "Known limitations" below.

### 2. Origin-header CSRF checks

A `checkOrigin(req)` utility compares the `Origin` header of the incoming request against `process.env.NEXTAUTH_URL` (the canonical site URL).

- If the `Origin` header is missing, the request is rejected (POST requests from a browser always include `Origin`; a missing `Origin` is suspicious).
- If the `Origin` header does not match `NEXTAUTH_URL` (allowing for protocol/host but not path), the request is rejected.
- The check runs on every custom POST endpoint (`/api/waitlist/approve`, `/api/waitlist/reject`, `/api/auth/set-password`).

This is a defence-in-depth CSRF measure. The primary CSRF defence is NextAuth's built-in double-submit cookie on its own endpoints; the `checkOrigin` utility covers the custom endpoints that NextAuth does not.

### Application

- `/api/auth/signup`: rate limit (public) + `checkOrigin`. The rate limit prevents waitlist spam. The CSRF check prevents a malicious site from signing a user up for an account without their consent.
- `/api/auth/signin`: rate limit (public). NextAuth provides its own CSRF check.
- `/api/auth/set-password`: rate limit (public) + `checkOrigin`. The rate limit prevents token brute-force. The CSRF check prevents a malicious site from setting an attacker-chosen password on a user's account via the invitation-token flow.
- `/api/waitlist/approve`, `/api/waitlist/reject`: rate limit (admin) + `checkOrigin`. The rate limit prevents an admin's session from being abused. The CSRF check prevents a malicious site from tricking an admin's browser into approving/rejecting waitlist entries.

## Alternatives considered

- **Upstash Redis distributed rate limiting.** Rejected at the time of the auth sprint: adds a new external dependency (Upstash), a new environment variable, a new failure mode (what if Upstash is unreachable?), and a per-request latency cost. The platform's traffic is low (small-admin-team, controlled-access); per-instance rate limiting is sufficient as a first layer. Upstash could be added in a future ADR if distributed rate limiting becomes necessary.
- **Vercel Edge Middleware.** Rejected: Edge Middleware runs on the Edge runtime, which has a different API surface from the Node runtime that the auth endpoints use. Writing the rate limiter in Edge Middleware would require duplicating the logic in two runtimes. The complexity is not justified for the platform's traffic level.
- **No rate limiting.** Rejected: the auth endpoints would be trivially abusable. Sign-up spam would pollute the waitlist; sign-in brute-force would eventually crack weak passwords; set-password brute-force (though computationally infeasible against a 256-bit token) would still generate noise in the audit log.
- **Rate limiting only via Vercel's platform features.** Considered: Vercel does not currently offer built-in per-route rate limiting on the Hobby/Pro plans. The platform would need to use a third-party service (which is the Upstash option above) or implement its own (which is this ADR).
- **CSRF tokens (double-submit cookie) on custom endpoints.** Considered: a double-submit cookie would be stronger than an Origin check in theory (it defends against a malicious site that can set the `Origin` header — but no browser allows that). The Origin check is simpler, sufficient against all real-world CSRF vectors, and is the recommendation of the OWASP CSRF Prevention Cheat Sheet for modern browsers. A double-submit cookie would also require the frontend to read and forward the cookie, which adds complexity. The Origin check is the right trade-off.
- **SameSite cookies only.** Rejected as the *only* defence: the auth-sprint endpoints are not all cookie-authenticated (the set-password endpoint is called by an unauthenticated user with a token). And `SameSite=Lax` allows top-level GETs, which is not the threat model here (we are protecting POSTs). SameSite cookies are a complementary defence, not a replacement.

## Known limitations

- **In-memory rate limiting is per-instance on Vercel serverless.** A determined attacker could bypass the limit by hitting different Vercel instances (each instance has its own `Map`). With 5 requests per 60 seconds per instance and (say) 10 warm instances, the effective limit is ~50 requests per 60 seconds. This is documented as a **known limitation**. For the platform's threat model (small-admin-team, low-traffic, invitation-only access), this is acceptable as a first layer. A future improvement would use Upstash Redis for distributed rate limiting (which would supersede this ADR, per section 36).
- **The Origin check trusts the browser's `Origin` header.** A non-browser client (e.g., `curl`, a custom HTTP client) can set `Origin` to anything. But CSRF is a *browser* attack — the threat model is "a malicious website tricks the user's browser into submitting a form". Non-browser clients are not the CSRF threat; they are the brute-force threat, which is handled by the rate limiter.
- **The rate limiter does not share state across instances.** A user who is rate-limited on one instance can immediately make a request to a different instance. Again, this is acceptable for the platform's threat model.

## Consequences

- Public endpoints are protected against spam and brute-force. Sign-up spam is bounded to 5 per minute per IP. Sign-in brute-force is bounded to 5 per minute per IP. Set-password token brute-force is bounded to 5 per minute per IP (and is also computationally infeasible against a 256-bit token).
- Admin endpoints are protected against CSRF. An attacker cannot trick an admin's browser into approving/rejecting waitlist entries.
- The set-password endpoint is protected against CSRF. An attacker cannot trick a user's browser into setting an attacker-chosen password.
- The rate limiter adds a small per-request overhead (a `Map.get` and a `Map.set` plus a filter over the timestamp array — typically a few microseconds).
- The Origin check adds a small per-request overhead (a header read and a string comparison — typically a few microseconds).
- The known limitation (per-instance rate limiting) is documented in this ADR and in the deployment README. Operators are aware that the platform's rate limiting is a first layer, not a hard distributed limit.
- Future improvement: migrate to Upstash Redis for distributed rate limiting. This would supersede this ADR (per section 36).

## Invariants affected

- **None directly.** This ADR is a security-hardening decision, not an architectural one. The kernel primitives, the rule engine, the state engine, the decision engine, and the contracts are unchanged.
- **I12** (capability boundaries) is *strengthened in practice* — a CSRF-protected endpoint refuses unauthorised callers, which is the spirit of capability enforcement. But the formal capability system (per `contracts/extension.md`) is unaffected: this ADR does not add capabilities, it adds transport-level protection.
- **I18** (hardening sprint may not redefine architecture): the kernel architecture is unchanged. This ADR records a security implementation choice.

## Migration implications

- The rate-limiter utility (`checkRateLimit`) and the CSRF utility (`checkOrigin`) are added as small, self-contained modules. They have no dependencies beyond `process.env.NEXTAUTH_URL`.
- The auth-sprint endpoints call these utilities at the start of their handler. No other code changes.
- The rate-limiter's in-memory `Map` lives in module scope. On Vercel serverless, the module is re-instantiated on cold-start; the `Map` is fresh. This is the documented behaviour and is the source of the known limitation.
- Environment variables required: `NEXTAUTH_URL` (the canonical site URL; per ADR 0007 — already required by NextAuth).
- Future revisions (e.g., Upstash Redis distributed rate limiting, double-submit cookie CSRF) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 25 (security).
- `contracts/audit.md` — rate-limit hits and CSRF failures recorded as `AuditEvent`s with `severity=WARN` or `severity=ERROR`.
- `decisions/0007-nextauth-credentials.md` — NextAuth's built-in CSRF protection on `/api/auth/*`.
- `decisions/0008-waitlist-approval-flow.md` — the public sign-up and admin approve/reject endpoints that need protection.
- `decisions/0009-invitation-tokens.md` — the set-password endpoint that needs protection.
- `decisions/0010-no-seed-endpoint.md` — the seed-endpoint removal that reduces the surface area this ADR protects.
- OWASP CSRF Prevention Cheat Sheet — the Origin-header recommendation followed by `checkOrigin`.
