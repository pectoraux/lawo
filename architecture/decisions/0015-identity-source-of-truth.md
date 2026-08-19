# ADR 0015 — Identity Source of Truth

- **Status:** ACCEPTED
- **Date:** Authorization sprint (post-0011)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The platform has, since the pre-auth era, carried a duplicate identity system. Two sources of truth existed for "who are the demo users?":

1. **The authoritative source** — the `User` table (Postgres, per ADR 0006), accessed via NextAuth's Credentials provider (per ADR 0007). The waitlist flow (ADR 0008) creates users here; the invitation-token flow (ADR 0009) activates them. Demo accounts are seeded by the operator-run script `scripts/seed-users.ts` (per ADR 0010). This is the source of truth that the authentication system consults.

2. **The legacy stub** — `src/platform/identity/Identity.ts`, which exported a hardcoded `demoIdentities` array:

   ```ts
   // PRE-0015 src/platform/identity/Identity.ts
   export const demoIdentities = [
     { id: 'demo-admin', email: 'admin@example.com', role: 'ADMIN', tenantId: '...' },
     { id: 'demo-user', email: 'user@example.com', role: 'USER', tenantId: '...' },
     ...
   ];
   export function getIdentity(id: string) { ... }
   ```

   This file was referenced by `GET /api/orient`, which returned an `identities` field in its response. The `identities` field was consumed by the demo AuthGate's quick-login buttons.

This split-brain is a code smell that becomes a security smell under authorization:

- The `demoIdentities` array carried `role` and `tenantId` fields that were *assertions*, not facts. If the seeded `User` table and the `demoIdentities` array disagreed (e.g., the admin was demoted in the DB but `demoIdentities` still listed `role: 'ADMIN'`), the AuthGate would present a quick-login button that, when clicked, would either fail authentication (the seeded user was gone) or succeed with the wrong role (the seeded user's role had changed but `demoIdentities` had not been updated). Either way, the user-visible behaviour was derived from a stale hardcoded array rather than from the authoritative `User` table.
- The duplicate system survived the auth sprint because it was classified as a "TENANT FEATURE" file (per the worklog HARDENING-SPRINT-REPORT component audit) — not a kernel file, so it did not violate any kernel-import rule. But classification is not correctness; the file is still a duplicate source of truth.
- The platform's identity model is simple: a `User` row, a NextAuth session, a JWT carrying `{ id, email, role, status, isDemo, tenantId }` (per ADR 0007). There is no architectural reason for a second source. The `demoIdentities` array exists because the pre-auth demo needed *something* to render quick-login buttons before NextAuth was wired up; once NextAuth was wired up, the array became vestigial.

This decision interacts with tenant data isolation (per I9 — identity is part of the tenant model: a user's `tenantId` is authoritative only when it comes from the `User` table) and with the architecture-change process (per I15 — removing a duplicate system is implementation cleanup, not an architectural change; this ADR records the cleanup for the historical record).

## Decision

**Delete `src/platform/identity/Identity.ts`. The authoritative identity source is the NextAuth session backed by the `User` table.**

### What is removed

- `src/platform/identity/Identity.ts` — the entire file. The `demoIdentities` export, the `getIdentity()` function, and any associated types.
- The `identities` field in the `GET /api/orient` response. The route no longer returns an `identities` field; clients that read it must be updated.
- Any import of `@/platform/identity/Identity` from elsewhere in the codebase. (A grep confirms the only importer was `/api/orient`.)
- The `src/platform/identity/` directory if it becomes empty after the file's removal. (If other platform-identity files remain, the directory stays; if not, the directory is removed too.)

### What is added

- `src/lib/auth/demoAccounts.ts` — a UI-only module that exports `DEMO_ACCOUNTS`, an array of `{ email, label }` pairs used by the AuthGate's quick-login buttons. The module is a UI concern (it tells the AuthGate which emails to render buttons for), not a platform concern (it does not assert roles or tenantIds — those come from the `User` table when the user signs in via the Credentials provider).
- The AuthGate's quick-login buttons call `signIn('credentials', { email, password })` (NextAuth's `signIn`). The password is supplied by the user (the demo AuthGate shows it in the UI for convenience; production deployments disable the demo AuthGate).
- `scripts/seed-users.ts` — already exists (per ADR 0010). The script seeds the demo accounts (admin, demo user) into the `User` table. The script is the only mechanism for seeding demo accounts; it is operator-run, never HTTP.

### What is unchanged

- The `User` table (per ADR 0006 — schema unchanged).
- NextAuth's Credentials provider (per ADR 0007).
- The waitlist approval flow (per ADR 0008).
- The invitation-token flow (per ADR 0009).
- The seed script (per ADR 0010).
- The kernel primitives — `Identity.ts` was never a kernel file; it was a platform-foundation file. The kernel is unaffected.

### The single source of truth

After this ADR, there is exactly one source of truth for identity:

```
scripts/seed-users.ts (operator-run) ─┐
                                       ▼
waitlist approval flow (admin-run) ─► User table (Postgres)
                                       │
                                       ▼
                                NextAuth Credentials provider
                                       │
                                       ▼
                                 JWT session (cookie)
                                       │
                                       ▼
                          SessionUser (in route handlers)
                                       │
                                       ▼
                          AuthGate (UI: who am I?)
```

The `DEMO_ACCOUNTS` array in `src/lib/auth/demoAccounts.ts` is *not* a source of truth for identity — it is a list of *emails to render buttons for*. The actual identity (role, tenantId, status) is always read from the session, which is always read from the `User` table.

## Alternatives considered

- **Keep `Identity.ts` as a "fallback".** Rejected: a fallback creates a split-brain source of truth. If the `User` table is unavailable (e.g., the database is down), the fallback returns stale hardcoded data — which is *worse* than failing, because it presents a false picture of the system's state. The correct behaviour on `User` table unavailability is for NextAuth's `authorize()` to throw (per ADR 0007), which fails the sign-in attempt loudly.
- **Merge `demoIdentities` into the database (i.e., keep the file but make it a thin read of the `User` table).** Rejected: this is what `DEMO_ACCOUNTS` in `src/lib/auth/demoAccounts.ts` is — a UI-only list of emails. The file's *assertions* (role, tenantId) are removed; only the *email list* remains, and the assertions come from the session at sign-in time. Renaming `Identity.ts` to "just read the User table" would be misleading (the file would have no logic — it would just be `db.user.findMany()`), so it is removed entirely.
- **Move `demoIdentities` into a config file (e.g., `config/demo-identities.json`).** Rejected: same problem. A config file is a source of truth that can drift from the `User` table. The only source of truth for identity is the `User` table; the only UI concern is which emails to render buttons for.
- **Delete the AuthGate's quick-login buttons entirely.** Rejected: the buttons are useful for the demo / staging deployment. They are removed in production via a feature flag (per the worklog HARDENING-SPRINT-REPORT known limitation 3). The buttons are not the problem — the *assertions* in `demoIdentities` were the problem.
- **Use NextAuth's `providers` array as the identity source.** Considered: NextAuth's `providers` is the *authentication* source (it lists the configured providers — Credentials, Google, GitHub, etc.), not the *identity* source (the list of users). The two are different. The `User` table is the identity source; NextAuth's `providers` is the authentication mechanism.

## Consequences

- **There is exactly one identity source: the `User` table.** Any code that needs to know "who are the users?" reads from the `User` table (via Prisma). Any code that needs to know "who is the current user?" reads from the NextAuth session. There is no second source.
- **`GET /api/orient` no longer returns an `identities` field.** Clients that read this field must be updated. (The demo AuthGate is the only known client; it now reads `DEMO_ACCOUNTS` from `src/lib/auth/demoAccounts.ts` instead.)
- **The AuthGate's quick-login buttons are rendered from `DEMO_ACCOUNTS`.** The buttons show the email and a label (e.g., "Demo Admin", "Demo User"). When clicked, they call `signIn('credentials', { email, password })`. The password is shown in the UI for convenience (demo only); production deployments disable the AuthGate.
- **`scripts/seed-users.ts` is the only seeding mechanism.** It already exists (per ADR 0010). The script is idempotent; running it twice does not create duplicate accounts.
- **The `src/platform/identity/` directory is removed** (if it becomes empty after `Identity.ts` is deleted). Future platform-identity concerns (e.g., a user-profile service, a directory service) would live in their own directory and consult the `User` table.
- **The static architecture test suite is unchanged.** No new check is added (the absence of `Identity.ts` is not a structural invariant — it is a one-time cleanup). If a future maintainer re-introduces a duplicate identity source, the code review process (and the runtime tests, which use the `User` table) should catch it.
- **The runtime test suite is unaffected.** The tests sign in via the NextAuth Credentials provider, which consults the `User` table. The tests do not read `demoIdentities` (the previous suite did not either).

## Invariants affected

- **I9** (tenant data isolation) — strengthened in practice. A user's `tenantId` is authoritative only when it comes from the `User` table (via the session). The `demoIdentities` array's `tenantId` field was an *assertion* that could drift from the `User` table; removing it eliminates the drift risk.
- **I15** (architecture is changed only through an ACO) — this ADR is **implementation cleanup, not an architectural change**. The architecture has always been "the `User` table is the identity source"; the duplicate `Identity.ts` was a code smell, not an architectural element. Removing it does not change the architecture; it brings the implementation into alignment with the architecture. This ADR records the cleanup for the historical record (per section 36 — ADRs record decisions, including cleanup decisions that affect future maintainability).
- **I5** — unaffected. Identity is not a legal decision.
- **I18** — this ADR is an authorization-sprint cleanup; the kernel architecture is unchanged.

## Migration implications

- `src/platform/identity/Identity.ts` — **deleted**. The file is removed; the directory is removed if empty.
- `src/app/api/orient/route.ts` — updated to remove the `identities` field from the response. The route's other fields (e.g., `version`, `endpoints`) are unchanged.
- `src/lib/auth/demoAccounts.ts` — added. Exports `DEMO_ACCOUNTS: { email, label }[]`. The array is a UI concern; it does not include `role` or `tenantId` (those come from the session at sign-in time).
- `src/components/.../AuthGate.tsx` (or wherever the quick-login buttons live) — updated to read `DEMO_ACCOUNTS` from `src/lib/auth/demoAccounts.ts` instead of `identities` from `/api/orient`.
- Existing `User` rows in the database are unaffected. The seeded demo accounts (per ADR 0010) continue to work; the AuthGate's quick-login buttons still sign them in.
- The runtime test suite is unaffected (it signs in via the Credentials provider, which consults the `User` table).
- Future revisions (e.g., adding a user-profile service, adding a directory service) supersede this ADR rather than overwrite it (section 36). Any new identity-related service must consult the `User` table as the source of truth; a second source of truth is not permitted.

## References

- `constitution.md` — section 24 (multi-tenancy), section 25 (security).
- `contracts/tenant.md` — the tenant isolation contract; the `User.tenantId` is part of the tenant model.
- `architecture/invariants.md` — I9 (tenant data isolation), I15 (architecture change process).
- `decisions/0006-postgresql-migration.md` — the `User` table in Postgres.
- `decisions/0007-nextauth-credentials.md` — the NextAuth Credentials provider that consults the `User` table.
- `decisions/0008-waitlist-approval-flow.md` — the waitlist flow that creates users in the `User` table.
- `decisions/0009-invitation-tokens.md` — the invitation-token flow that activates users in the `User` table.
- `decisions/0010-no-seed-endpoint.md` — the seed script (`scripts/seed-users.ts`) that seeds demo accounts into the `User` table.
- `src/lib/auth/demoAccounts.ts` — `DEMO_ACCOUNTS` (UI-only list of demo emails).
- `src/app/api/orient/route.ts` — the orient route (the `identities` field is removed).
- `worklog.md` — HARDENING-SPRINT-REPORT "Architecture Conflicts" section, known limitation 2 (the duplicate identity system this ADR removes).
