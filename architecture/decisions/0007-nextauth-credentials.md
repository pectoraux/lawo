# ADR 0007 — NextAuth Credentials Provider + JWT Sessions

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The platform requires user authentication with email/password credentials and waitlist gating (see ADR 0008). The deployment target is Vercel serverless (ADR 0006), where:

- invocations are short-lived and stateless
- there is no in-process session cache that survives between invocations
- a per-request DB write (for session creation/lookup) is expensive and adds latency to every authenticated call

The platform also must not enumerate valid emails (returning "user not found" vs "wrong password" allows account enumeration) and must support a stateless `status=ACTIVE` gate: a `WAITLISTED` user cannot sign in even with correct credentials.

The auth subsystem is **separate from the rule engine** (per I5 — LLM output is never authoritative legal truth; auth is not a legal decision). But auth interacts with the tenant subsystem (per I9 — users have a `tenantId` and can read only their own data plus global data).

## Decision

Adopt **NextAuth.js v4** with the **Credentials provider** and the **JWT session strategy**.

### Credentials provider

- The `authorize()` callback receives `(email, password)` from the sign-in form.
- It loads the `User` row by email, compares the supplied password against the stored `passwordHash` using `bcryptjs`, and returns the user object on match or `null` on mismatch.
- It gates on `status`: a `WAITLISTED` user (per ADR 0008 — has not yet set a password via the invitation-token flow, ADR 0009) cannot sign in. A `DISABLED` user cannot sign in.
- Custom error messages: sign-in failures return a generic "Invalid email or password" — never "user not found" vs "wrong password". This prevents account enumeration.

### Password hashing

- Passwords are hashed with `bcryptjs` (10 rounds). The cleartext password is never logged, never stored, never returned in any API response.
- Password hashing happens only inside the `authorize()` callback and inside the set-password endpoint (per ADR 0009 — where the user sets their own password).

### JWT session strategy

- NextAuth uses the JWT session strategy (not the database session strategy). Sessions are encoded as signed JWTs with `NEXTAUTH_SECRET`.
- JWT `maxAge` is 30 days. The token carries `userId`, `email`, `role`, `tenantId`, `status`.
- The JWT is stored in an HttpOnly cookie. The cookie is `SameSite=Lax`, `Secure` in production.
- Per-request auth verification is a JWT signature check + a `status=ACTIVE` check — **no DB read** is required for a normal authenticated request. This is the key reason for choosing JWT over database sessions.

### Auth models

The auth models live alongside the kernel-persistence models in the Prisma schema (per ADR 0006):

- `User` — `{ id, email, emailVerified?, name?, passwordHash?, role, status, tenantId, invitationToken?, invitationExpiresAt?, createdAt, updatedAt }`
- `Account`, `Session`, `VerificationToken` — NextAuth standard models (present but not actively used in the Credentials+JWT configuration; retained so other providers can be added later without a schema migration)

The `User.role` enum is `{ USER, OPERATOR, PACKAGER, ADMIN }`. The `User.status` enum is `{ WAITLISTED, ACTIVE, DISABLED }`.

## Alternatives considered

- **NextAuth with the Prisma Adapter (database sessions).** Rejected: the Prisma Adapter persists a `Session` row on every sign-in and reads it on every authenticated request. On Vercel serverless this adds a DB round-trip to every authenticated API call. JWT sessions avoid this entirely. Database sessions are also a target for session-fixation attacks if the session id is leaked.
- **Auth.js v5 (the next major).** Rejected at the time of the auth sprint: v5 was in beta, had breaking API changes from v4, and the documentation was incomplete. The migration cost was not justified for a hardening sprint. v4 is stable, well-documented, and meets all requirements.
- **Custom JWT implementation.** Rejected: re-invents signing, refresh, revocation, cookie handling, CSRF — all of which NextAuth already does correctly. The risk of getting a custom implementation wrong (especially around JWT revocation when a user is `DISABLED`) is too high. NextAuth's JWT strategy is sufficient for the platform's needs.
- **Magic-link email auth.** Rejected: requires email integration (SMTP or a provider like Resend/SendGrid) that is out of scope for the auth sprint. Also: magic links are bearer tokens — if the email is intercepted, the attacker has the session. Password + bcrypt + JWT is acceptable for the platform's threat model.
- **OAuth-only (Google/GitHub).** Rejected: the platform's waitlist model (ADR 0008) requires admin approval of each user. OAuth providers give immediate account creation, which conflicts with the waitlist gate. OAuth could be added later as an *additional* provider alongside Credentials, but Credentials is the primary.

## Consequences

- Sessions are stateless. The JWT carries everything needed to authorise a request: `userId`, `role`, `tenantId`, `status`. A `status` change (e.g., admin disables a user) takes effect on the user's next sign-in; the existing JWT is honoured until expiry or until a revocation list is consulted. For the platform's threat model (small admin team, low user count, no immediate-revocation requirement) this is acceptable.
- `authorize()` gates on `status=ACTIVE`: a `WAITLISTED` user (one who has been approved but has not yet set a password via the invitation-token flow, ADR 0009) cannot sign in. The error message is the same generic "Invalid email or password" — this is correct because the user has not yet set a password, so any supplied password is wrong by definition.
- The JWT is signed with `NEXTAUTH_SECRET`. If the secret leaks, all sessions are compromised; the operator must rotate the secret and force re-sign-in.
- The `User.tenantId` field on the JWT makes tenant scoping trivial in the API: every authenticated request knows the caller's `tenantId`. This strengthens I9 enforcement: a tenant's API call cannot accidentally query another tenant's data because the `tenantId` filter is applied from the JWT, not from user-supplied input.
- NextAuth's built-in CSRF protection covers its own endpoints (`/api/auth/*`). Custom POST endpoints (`/api/waitlist/approve`, `/api/waitlist/reject`, `/api/auth/set-password`) require their own CSRF check (per ADR 0011).
- Rate limiting on `/api/auth/signin` and `/api/auth/signup` is mandatory (per ADR 0011) — without it, an attacker can brute-force passwords.

## Invariants affected

- **I5** — auth is separate from the rule engine. Authentication is not a legal decision; it does not consult `RuleIR`, does not produce `Provenance`, does not flow through the `DecisionEngine`. This is by design: the kernel's authoritative machinery is unaffected by auth.
- **I9** — users have a `tenantId` that flows into the JWT and is enforced on every authenticated API call. The auth subsystem is the *entry point* for tenant scoping, but enforcement happens in the persistence layer and the engines (per `contracts/tenant.md`).
- **I12** — extensions cannot bypass capability permissions. The auth subsystem is not an extension; it is the Platform Foundation. But the principle applies: an authenticated user with role `USER` cannot invoke a `PACKAGER`-only endpoint, just as an extension without `INVOKE` cannot invoke a connector. Capability boundaries are enforced at the API layer via the JWT's `role` claim.
- **I18** — this ADR is an auth-sprint decision, not a kernel-architecture change. The kernel primitives, engines, and contracts are unchanged.

## Migration implications

- The auth models (`User`, `Account`, `Session`, `VerificationToken`) are added as new tables in the Prisma schema (per ADR 0006). No kernel table is modified.
- Environment variables required: `NEXTAUTH_URL` (the canonical site URL), `NEXTAUTH_SECRET` (the JWT signing secret). Both must be set in Vercel.
- The `authorize()` callback must be updated if the `UserStatus` enum changes (e.g., adding `SUSPENDED`). Such a change is a schema migration requiring an ACO (per I16).
- The Credentials provider can be augmented with additional providers (Google, GitHub, etc.) in a future ADR without breaking existing users — NextAuth's multi-provider model supports this.
- Future revisions to the auth strategy (e.g., migrating to Auth.js v5 once stable, or adding OAuth) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 25 (security), section 24 (multi-tenancy).
- `contracts/tenant.md` — tenant isolation that auth enforces.
- `contracts/audit.md` — auth events (sign-in, sign-out, sign-up) recorded in the audit trail.
- `decisions/0006-postgresql-migration.md` — the Postgres schema that backs the `User` model.
- `decisions/0008-waitlist-approval-flow.md` — the waitlist gating that `authorize()` enforces.
- `decisions/0009-invitation-tokens.md` — the invitation-token + set-password flow that produces `status=WAITLISTED → ACTIVE`.
- `decisions/0011-rate-limiting-and-csrf.md` — rate limiting and CSRF protection on the auth endpoints.
- `src/kernel/primitives/types.ts` — `AuditEvent` shape used to record auth events.
