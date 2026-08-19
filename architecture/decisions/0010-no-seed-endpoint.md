# ADR 0010 — No Remote Seed Endpoint

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005) — SEC-6 hardening
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

During early development the platform carried a `/api/seed-demo` endpoint that, when called, would seed the database with a set of demo accounts (admin user, demo tenant, demo facts, demo rules). The endpoint was convenient for development: a fresh deployment could be initialised with a single HTTP call.

The endpoint is an **unnecessary attack surface** for production:

- It is **remotely callable**. Any attacker who can reach the deployment can invoke it (the original implementation gated on a token, but a token-bearing endpoint is still remotely callable — a token leak is sufficient).
- It creates **privileged accounts** (admin user, demo tenant). An attacker who can invoke the endpoint can reset the platform to a known state with known credentials, then sign in as admin.
- The token (if any) and the secret material (generated passwords) transit through HTTP, may appear in Vercel access logs, and may be cached by intermediaries.
- The endpoint has no place in a production deployment. Demo data is a deployment-time concern, not a runtime concern.

The platform's threat model is small-admin-team, but the SEC-6 hardening requirement (per the sprint brief) is that **no extension or remote caller can create privileged accounts**. Seeding must be an explicit operator action with database access, not an HTTP endpoint.

This decision interacts with capability enforcement (per I12 — extensions cannot bypass capability permissions; the same principle applies to *unauthenticated remote callers*, who have even fewer capabilities).

## Decision

**Delete the `/api/seed-demo` endpoint.** Demo accounts are seeded via an explicit deployment operation only: the operator runs `bun run scripts/seed-users.ts` locally (or in CI, against a `DIRECT_URL` connection — per ADR 0006) with database access. The script is never exposed via HTTP.

### What was removed

- The `/api/seed-demo` route handler and any associated test.
- Any reference to a "seed endpoint" in the frontend (the demo page no longer offers a "Reset demo data" button).
- Any token or environment variable previously used to gate the endpoint.

### What was added

- `scripts/seed-users.ts` — an executable script that connects to the database via `DIRECT_URL` and seeds the demo accounts (admin user, demo tenant, demo facts, demo rules). The script is idempotent: it skips accounts that already exist rather than recreating them.
- The script is documented in the deployment README: "run `bun run scripts/seed-users.ts` to seed demo accounts". The script is run by the operator with DB access, never via HTTP.

### Seeding policy

- Fresh deployments require the operator to run the seed script locally. This is documented in the deployment README and is part of the deployment checklist.
- The script connects via `DIRECT_URL` (the direct connection string, not the pooled runtime URL) — per ADR 0006, DDL and one-off writes use the direct URL.
- The script is idempotent: running it twice does not create duplicate accounts. This lets operators re-run after a partial failure without manual cleanup.
- The script is the **only** mechanism for seeding privileged accounts. There is no remote seeding capability.

## Alternatives considered

- **Keep the endpoint with a token.** Rejected: still remotely callable. A token leak (in source code, in CI logs, in chat history) is sufficient to invoke the endpoint. The token does not change the threat model — it just adds one more secret to manage.
- **Move seeding to a Vercel build step.** Rejected: Vercel build steps log their output, including any environment variables that the script reads. Secrets in build logs are a known leak vector. Build-time seeding also couples the database state to the build pipeline, which is wrong — database state should be a deliberate operator action, not a side effect of deploying.
- **Move seeding to a Vercel cron job.** Rejected: a cron job is still remotely invokable (Vercel cron calls a route). And the cron-job model assumes periodic re-seeding, which is not the goal — the goal is one-time initial seeding.
- **Keep the endpoint but restrict to `ADMIN`-role callers.** Rejected: an admin can already create users via the waitlist flow (ADR 0008). The endpoint exists to seed the *first* admin (the bootstrap problem). Once the first admin exists, the endpoint is unnecessary. And keeping the endpoint "for the bootstrap case" leaves a remotely callable privileged endpoint live in production indefinitely.
- **Use a `prisma db seed` invocation.** Considered and partially accepted: `prisma db seed` is the standard Prisma seeding mechanism. The platform's `scripts/seed-users.ts` is the equivalent: it runs against `DIRECT_URL` and is invoked by the operator, not by HTTP. The choice of a standalone script over `prisma db seed` is a minor implementation detail — both achieve the same security property (no remote seeding).

## Consequences

- Fresh deployments require the operator to run `bun run scripts/seed-users.ts`. This is documented in the deployment README and is part of the deployment checklist. There is no remote shortcut.
- The first admin user is created by the seed script. The script generates a random password (or an invitation token, per ADR 0009) and writes it to the operator's terminal. The operator uses this to sign in for the first time and immediately changes the password (or follows the invitation-token flow).
- The seed script is idempotent — running it twice does not create duplicate accounts. This lets operators re-run after a partial failure without manual cleanup.
- No remote caller can create privileged accounts. The only way to create a privileged account is to have DB access (operator) or to be an admin via the waitlist flow (ADR 0008). This is the desired security property.
- The frontend's "Reset demo data" affordance (if any) is removed. The demo data persists across deployments; if it needs to be reset, the operator drops and re-seeds via the script.
- The `/api/seed-demo` route returns 404 in production (the route handler is deleted, not just disabled).

## Invariants affected

- **I12** — capability: no extension (or remote caller) can create privileged accounts. The set of capabilities available to a remote caller is *strictly smaller* than the set available to an operator with DB access. This is the same principle that applies to extensions: an extension without `WRITE` cannot write tenant data; a remote caller without DB access cannot seed privileged accounts. The seed endpoint, had it remained, would have violated this principle by giving remote callers a `WRITE`-equivalent capability for privileged accounts.
- **I5** — seeding is not a legal decision. It does not consult `RuleIR`, does not produce `Provenance`. This is by design.
- **I9** — tenant data: the seed script creates the demo tenant and the first admin user. The script runs against `DIRECT_URL` (per ADR 0006) and is the only mechanism for creating the bootstrap admin. Subsequent users go through the waitlist flow (ADR 0008).
- **I18** — this ADR is a hardening decision (removing an attack surface); the kernel architecture is unchanged.

## Migration implications

- The `/api/seed-demo` route handler is deleted. Any client code that called it (the frontend's "Reset demo data" button, if any) is also removed.
- The `scripts/seed-users.ts` script is added. It is run by the operator with DB access; it is never invoked via HTTP.
- Existing deployments that already have demo accounts are unaffected — the seed script is idempotent and will skip existing accounts.
- Future revisions to the seeding approach (e.g., a `prisma db seed` integration, a templated seed for new tenants) supersede this ADR rather than overwrite it (section 36).
- The architecture test suite (section 34) does not directly test for the absence of `/api/seed-demo` (that would be a brittle test). The capability-enforcement test (`extensions-respect-capability-boundaries`) and the tenant-isolation test (`tenant-data-isolation`) cover the spirit of this ADR: no remote caller has the capability to create privileged accounts.

## References

- `constitution.md` — section 22 (capability-based permissions), section 25 (security).
- `contracts/audit.md` — `AuditEvent` records for `SET_PASSWORD` (the first admin's password set, per ADR 0009).
- `contracts/tenant.md` — the demo tenant created by the seed script.
- `decisions/0006-postgresql-migration.md` — the `DIRECT_URL` connection used by the seed script.
- `decisions/0007-nextauth-credentials.md` — the Credentials provider that the seeded admin uses to sign in.
- `decisions/0008-waitlist-approval-flow.md` — the waitlist flow that replaces remote seeding for subsequent users.
- `decisions/0009-invitation-tokens.md` — the invitation-token flow that the first admin uses to set their password.
- `scripts/seed-users.ts` — the seed script (operator-run, not HTTP).
