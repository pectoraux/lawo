# ADR 0012 — Tenant Authorization Boundary

- **Status:** ACCEPTED
- **Date:** Authorization sprint (post-0011)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The previous auth sprint (ADRs 0006–0011) closed the *authentication* gap — every privileged route now requires a NextAuth session and every mutation is CSRF-checked (ADR 0011). The static architecture test suite (§34) confirms this: `privileged-routes-check-authz` and `csrf-on-mutations` both pass against the source code.

But authentication is not authorization. **Authentication answers "who are you?" Authorization answers "are you allowed to do this?"** The previous sprint's gates verified only the former. Once a caller was authenticated, the data-access layer accepted any `tenantId` / `subjectId` the client chose to send:

- `GET /api/decisions?subjectId=<other-tenant-subject>` — the route passed the client's `subjectId` straight into `db.decisionRecord.findMany({ where: { subjectId } })` with **no tenant filter**. An authenticated User A could read every `DecisionRecord` for any subject in the system, including subjects owned by Tenant B.
- `GET /api/audit?subjectId=<other-tenant-subject>` — same pattern. The `AuditLog.forSubject()` query is platform-wide; the client chose whose audit history to read.
- `POST /api/state` (pre-0013) — the body carried `tenantId` straight into the persisted `DecisionRecord.tenantId`. An authenticated User A could persist decisions tagged to Tenant B, polluting Tenant B's decision history.

The static architecture test suite did not catch this — and **could not** catch this — because the gap is *behavioral*, not *structural*. The source files contained the right import (`requireUser`, `checkOrigin`), the right guard call, and the right table; the bug was that the route trusted the client's `tenantId` / `subjectId` rather than the session's `tenantId`. A structural test that scans for "is there a guard call?" passes; a runtime test that asks "can User A read Tenant B's decisions?" fails.

This ADR records the architectural decision that closes the gap. The runtime tests that enforce it are described in `architecture-tests/CATEGORIES.md` and live in `tests/runtime-security/run.ts` (AUTHZ-001 through AUTHZ-006).

This decision interacts with tenant isolation (per I9 — now enforced at the data-access boundary, not just documented) and with capability boundaries (per I12 — non-admins have the capability set `{READ, WRITE}` *only on their own tenant*; admins have an additional explicit `platformWide` capability for reads).

## Decision

**Every authenticated API route derives the effective tenant scope from the authenticated session, not from client-supplied `tenantId` / `subjectId` query params.**

### The authorization primitive

`src/lib/auth/guards.ts` exports two pairs of helpers:

1. **Guard pair** (authentication + CSRF, returns the user):
   - `requireUserWithScope(req)` — POST/PUT/DELETE: requires an authenticated ACTIVE user AND a same-origin (CSRF-safe) request. Returns `{ user, response }`. If `response` is non-null, the route returns it.
   - `requireAdminWithScope(req)` — POST/PUT/DELETE: requires an authenticated ACTIVE ADMIN AND a same-origin request.
   - `requireUserAuthenticated()` — GET: requires an authenticated ACTIVE user (any role). No CSRF check (safe method).

2. **Scope pair** (authorization, given the user from step 1):
   - `effectiveTenantScope(user, opts?)` — returns the `tenantId` the caller is authorized to read/write. Non-admins: their own `tenantId` (or `null` if global — but active users always have a tenant). Admins with `opts.allowPlatformWide=true`: the sentinel `'__PLATFORM_WIDE__'`, which the route handler interprets as "no tenant filter".
   - `canAccessTenant(user, targetTenantId, opts?)` — returns `true` if the caller is authorized to access data belonging to `targetTenantId`. Non-admin: `targetTenantId === user.tenantId`. Admin with `opts.allowPlatformWide=true`: always `true`.

### Route-handler pattern

Every authenticated route that reads tenant-scoped data follows this pattern:

```ts
export async function GET(req: NextRequest) {
  const { user, response } = await requireUserAuthenticated();
  if (response) return response;

  const url = new URL(req.url);
  const requestedSubjectId = url.searchParams.get('subjectId');
  const platformWide = url.searchParams.get('platformWide') === 'true' && user.role === 'ADMIN';

  // Derive the tenant filter from the SESSION, not from the query string.
  const tenantFilter = platformWide ? undefined : user.tenantId;

  // subjectId is AND-scoped with the tenant filter so it can never bypass isolation.
  const where: { tenantId?: string; subjectId?: string } = {};
  if (tenantFilter !== undefined) where.tenantId = tenantFilter;
  if (requestedSubjectId) where.subjectId = requestedSubjectId;

  const records = await db.decisionRecord.findMany({ where, ... });
  ...
}
```

The same pattern applies to `POST /api/state`: the `tenantId` written into the persisted `DecisionRecord` comes from `user.tenantId`, never from `body.tenantId` (the body type does not even declare a `tenantId` field — see ADR 0013).

### What is explicitly NOT allowed

- A route handler that reads `req.searchParams.get('tenantId')` and uses it as a Prisma `where.tenantId` filter. The client's `tenantId` is **ignored**. The session's `tenantId` is authoritative.
- A route handler that uses `subjectId` *without* a tenant filter. `subjectId` is always AND-scoped with the tenant filter; a `subjectId` belonging to another tenant must return zero rows (not the other tenant's rows).
- An admin route that defaults to platform-wide reads. Admins default to **own-tenant** scope; `platformWide=true` is **required** to unlock cross-tenant reads. This makes admin platform-wide access explicit and auditable (the query string is in the access logs).
- A mutation that accepts a client-supplied `tenantId` for the *target* of the write. Writes are always scoped to the caller's own `tenantId`. Admins do not get a `platformWide` write capability — admin cross-tenant writes (if ever needed) would require a separate ADR.

### Where it applies

- `GET /api/decisions` — see `src/app/api/decisions/route.ts`. `tenantFilter` derived from `user.tenantId`; `subjectId` AND-scoped.
- `GET /api/audit` — same pattern via `AuditLog.forSubjectInTenant(subjectId, tenantId)`. The platform-wide `AuditLog.forSubject(subjectId)` is admin-only and gated on `platformWide=true`.
- `POST /api/state` — the persisted `DecisionRecord.tenantId` is `user.tenantId`, never `body.tenantId`. See ADR 0013 for the integrity side of this.

### What is unchanged

- Authentication (ADRs 0007, 0011) — `requireUser` / `requireAdmin` still gate the session.
- CSRF (ADR 0011) — `checkOrigin(req)` still gates every mutation.
- Rate limiting (ADR 0011) — still applies per-IP and per-user.
- The kernel primitives (`Fact`, `Rule`, `DecisionRecord`, `AuditEvent`) — unchanged. The decision is at the API/authorization layer, not at the kernel layer.

## Alternatives considered

- **Postgres Row-Level Security (RLS).** Rejected as the *primary* mechanism: RLS would force every query to carry the session's `tenantId` as a session variable, which is correct for tenant isolation but too rigid for the admin platform-wide read case. An admin needs to read across tenants when (and only when) `platformWide=true` is set; encoding that as a per-query RLS exemption would require a session variable toggle on every admin read, which is brittle. RLS could be added as a *defence-in-depth* layer in a future ADR — the application-layer check remains the source of truth.
- **A Next.js middleware that injects `tenantId` into `req`.** Rejected: middleware can inject the session's `tenantId` into a request header, but this does not cover the `subjectId` bypass. The bug was not "the route didn't have a `tenantId`" — it was "the route trusted the client's `subjectId` without AND-scoping it with a tenant filter". A middleware that injects `tenantId` does not prevent a route from issuing `findMany({ where: { subjectId } })` with no tenant filter. The fix must be at the data-access boundary, not the transport boundary.
- **An OPA / Cedar policy layer.** Rejected as premature: the platform's authorization model is small (4 roles, one dimension — tenant). A policy engine adds operational complexity (a new service, a new policy language, a new failure mode) without commensurate benefit. If the model grows (e.g., per-resource ACLs, attribute-based access control), this should be revisited.
- **Per-route hand-written checks (no shared helper).** Rejected: this is what the previous sprint did, and it is exactly what produced the gap. The `effectiveTenantScope` / `canAccessTenant` helpers exist so that the correct pattern is *easier to write than the wrong pattern*. The runtime test suite (AUTHZ-001 through AUTHZ-006) catches regressions, but the helper is the primary defence.
- **Allow `platformWide` by default for admins.** Rejected: defaults matter. If admins are platform-wide by default, every admin read becomes an implicit cross-tenant access, and the audit log cannot distinguish "admin read their own tenant" from "admin read all tenants". The explicit `?platformWide=true` makes the intent visible in the access log.

## Consequences

- **Non-admin users see only their own tenant's data.** A User A request for `subjectId` belonging to Tenant B returns zero rows (not an error — the row simply does not match the `where` clause). This is the desired security property.
- **Admin platform-wide reads are explicit and auditable.** An admin who passes `?platformWide=true` is recorded in the access log (Vercel access log captures the query string). The audit log's `actor` + `action` fields plus the access-log query string together answer "which admin read across tenants, when, and why?".
- **Admins without the flag are own-tenant scoped.** This is the default. An admin who wants their own tenant's data does not need to set the flag — the default is the safer option.
- **The `subjectId` query param remains useful.** A non-admin can still filter their own tenant's decisions by `subjectId` — the AND-scope with `tenantId` means they see only their own tenant's subjects. The param is not removed; it is constrained.
- **Writes are always own-tenant.** There is no admin platform-wide write capability. If an admin needs to correct a record in another tenant (e.g., remove a corrupted decision), they must do it via a DB operation, not via the API. This is a deliberate restriction — admin cross-tenant writes are a future ADR if needed.
- **The static architecture test suite is unchanged.** The `privileged-routes-check-authz` check still verifies the guard call is present; it cannot verify the tenant filter is correct. The runtime test suite (AUTHZ-001 through AUTHZ-006) is the new enforcement layer (see `architecture-tests/CATEGORIES.md`).
- **Future routes must follow the pattern.** Any new authenticated route that reads tenant-scoped data must use `effectiveTenantScope` or `canAccessTenant`. A code review checklist item is added: "does this route derive tenantId from the session, not from the request?".

## Invariants affected

- **I9** (tenant data isolation) — now **enforced at the data-access boundary**, not just documented. Previously I9 was tagged `Machine-checkable: NO` because tenant isolation was behavioral. With this ADR and the runtime test suite (AUTHZ-001 through AUTHZ-006), I9 is now `Machine-checkable: YES` at the runtime level. The static check `privileged-routes-check-authz` still passes (it verifies the guard call is present); the runtime check `runtime-tenant-isolation` verifies the actual isolation.
- **I12** (capability boundaries) — strengthened in practice. A non-admin's capability set is `{READ, WRITE}` on their own tenant; an admin's set adds an explicit `platformWide READ` capability. The principle is the same as for extensions: capabilities are declared, the runtime checks each call against them.
- **I5** — unaffected. This decision does not touch the LLM or the decision engine.
- **I18** — this ADR is an authorization-sprint decision; the kernel architecture is unchanged.

## Migration implications

- `src/lib/auth/guards.ts` is the new authoritative source for the `effectiveTenantScope` / `canAccessTenant` helpers. Existing routes that previously inlined a tenant filter are migrated to call the helpers.
- `GET /api/decisions` and `GET /api/audit` are updated to derive `tenantFilter` from `user.tenantId` and to AND-scope `subjectId`. The API contract (query params, response shape) is unchanged for non-admin callers — they still see the same data they saw before (their own tenant's). The change is observably visible only to clients that were *previously exploiting the gap* — those clients now receive zero rows for other tenants' data.
- `POST /api/state` is updated to write `user.tenantId` into the persisted `DecisionRecord.tenantId`, never `body.tenantId`. The request body type (`StateRequestBody`) does not declare a `tenantId` field — see ADR 0013 for the integrity rationale.
- `AuditLog.forSubjectInTenant(subjectId, tenantId)` is added to `src/platform/audit/AuditLog.ts` and used by `/api/audit` for non-admin callers. The existing `AuditLog.forSubject(subjectId)` is retained but is now admin-only (gated on `platformWide=true`).
- The runtime test suite (`tests/runtime-security/run.ts`, AUTHZ-001 through AUTHZ-006) is added in a parallel task. It is required to pass before a PR touching `src/app/api/`, `src/lib/auth/`, or `src/platform/` is mergeable (see `architecture-tests/CATEGORIES.md`).
- Future revisions (e.g., adding RLS as defence-in-depth, adding admin cross-tenant write capability, adding attribute-based access control) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 24 (multi-tenancy), section 25 (security).
- `contracts/tenant.md` — the tenant isolation contract this ADR enforces at the API layer.
- `contracts/audit.md` — the `AuditLog.forSubjectInTenant` method that enforces tenant scoping on audit reads.
- `architecture/invariants.md` — I9 (tenant data isolation), I12 (capability boundaries).
- `architecture/architecture-tests/CATEGORIES.md` — the runtime test suite that enforces this ADR (AUTHZ-001 through AUTHZ-006).
- `decisions/0007-nextauth-credentials.md` — the session that supplies `user.tenantId`.
- `decisions/0011-rate-limiting-and-csrf.md` — the authentication + CSRF layer this ADR builds on.
- `decisions/0013-decision-integrity-separation.md` — the companion ADR for `POST /api/state` integrity (the `tenantId` written into the persisted record is `user.tenantId`).
- `src/lib/auth/guards.ts` — `requireUserWithScope`, `requireAdminWithScope`, `effectiveTenantScope`, `canAccessTenant`.
- `src/app/api/decisions/route.ts` — the GET handler pattern (tenantFilter from session; subjectId AND-scoped).
- `src/app/api/state/route.ts` — the POST handler that writes `user.tenantId` into the persisted `DecisionRecord`.
- `src/platform/audit/AuditLog.ts` — `forSubjectInTenant` (tenant-scoped) vs `forSubject` (platform-wide, admin-only).
