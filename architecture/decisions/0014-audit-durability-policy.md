# ADR 0014 — Audit Durability Policy

- **Status:** ACCEPTED
- **Date:** Authorization sprint (post-0011)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The audit log (`src/platform/audit/AuditLog.ts`) is the platform's tamper-evident trail of material actions. `contracts/audit.md` specifies the `AuditEvent` shape; I6 requires that every material decision has provenance, and provenance at the platform-foundation level is operationalized as audit events. The audit log is consulted by operators to answer: "who approved this user?", "when was this password set?", "which admin ran a platform-wide read?", "what decision was computed for this subject?".

The previous implementation of `AuditLog.record()` (a single method, no split) silently returned a synthesized `AuditEvent` on database failure:

```ts
// PRE-0014 AuditLog.record (single mode)
async record(event): Promise<AuditEvent> {
  try {
    return await db.auditEvent.create({ data: { ... } });
  } catch (err) {
    console.warn('[AuditLog] record failed:', err);
    return { ...event, id: `fallback-${Date.now()}`, timestamp: new Date().toISOString(), _fallback: true };
  }
}
```

This has a critical failure mode: **a failed audit write is indistinguishable from a successful one**. The caller receives an `AuditEvent` back either way; the `_fallback: true` flag is buried in the payload and was not checked by any caller. The route handler proceeds as if the audit succeeded — the privileged action (waitlist approval, set-password) is committed, and the audit trail has a hole.

This is the opposite of what an audit trail is for. The whole point of recording an audit event for a privileged action is that *if the audit cannot be recorded, the action should not proceed*. A banking system that posts a withdrawal but cannot record the withdrawal is a banking system with a hole in its ledger. A platform that approves a user but cannot record the approval is a platform that cannot answer "who approved this user?".

The previous behaviour also created a second problem: it forced every caller to choose between two bad options. Either (a) ignore the audit failure and proceed (the audit trail is silently broken), or (b) inspect the `_fallback: true` flag and abort (every caller has to remember to do this, and the flag was easy to miss). Neither is good.

This decision interacts with provenance (per I6 — the audit trail is part of the provenance story for privileged operations), with capability enforcement (per I12 — a privileged action that cannot be audited is a privileged action that should not happen), and with the kernel's authoritative-machinery principle (per I5 — the audit trail is deterministic server machinery, not best-effort logging).

## Decision

**Split audit recording into two modes:**

1. **`record()` — DURABLE.** Throws `AuditPersistenceError` on database failure. The caller catches the error and rolls back the action. Use for security-sensitive operations: waitlist approval, set-password, sign-in, role changes, privileged mutations.
2. **`recordBestEffort()` — NON-DURABLE.** Returns a synthesized `AuditEvent` flagged via `payload._durable: false` on database failure. Use for informational events: `decision.compute` info, `decision.persist` info, page-view telemetry (if any).

### The interface

```ts
export interface AuditLog {
  /** DURABLE record. Throws on DB failure. Use for security-sensitive actions. */
  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  /** BEST-EFFORT record. Returns a non-durable synthesized event on failure. */
  recordBestEffort(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  recent(tenantId: string | null, limit?: number): Promise<AuditEvent[]>;
  forSubject(subjectId: string, limit?: number): Promise<AuditEvent[]>;        // admin-only
  forSubjectInTenant(subjectId: string, tenantId: string, limit?: number): Promise<AuditEvent[]>;
}

export class AuditPersistenceError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuditPersistenceError';
    this.cause = cause;
  }
}
```

### Durable mode — security-sensitive operations

A security-sensitive operation is one where the audit trail is the *only* record of who-did-what. If the audit cannot be recorded, the operation must not proceed — otherwise the platform cannot answer "who approved this user?".

The pattern is:

```ts
try {
  await auditLog.record({
    tenantId: user.tenantId,
    actor: user.email,
    action: 'waitlist.approve',
    subjectId: entryId,
    severity: 'INFO',
    payload: { approvedRole: role, userId: newUser.id },
  });
} catch (err) {
  if (err instanceof AuditPersistenceError) {
    // Roll back the approval. The user creation is reversed; the waitlist
    // entry is returned to PENDING. The operator must retry.
    await db.user.delete({ where: { id: newUser.id } }).catch(() => {});
    await db.waitlistEntry.update({ where: { id: entryId }, data: { status: 'PENDING' } });
    return NextResponse.json({ error: 'Audit recording failed; action rolled back' }, { status: 503 });
  }
  throw err;
}
```

Operations that use durable mode:

- `waitlist.approve` — admin approves a waitlist entry (creates a `User`).
- `waitlist.reject` — admin rejects a waitlist entry.
- `auth.set_password` — user sets their initial password (transitions `WAITLISTED` → `ACTIVE`).
- `auth.signin_success` / `auth.signin_failure` — sign-in attempts (for brute-force detection).
- `auth.role_change` — admin changes a user's role.
- Any future operation where the audit trail is the only record of who-did-what.

### Best-effort mode — informational events

An informational event is one where the audit trail is *useful* but not *load-bearing*. If the audit cannot be recorded, the operation can proceed — the decision was still computed, the page was still served.

The pattern is:

```ts
await auditLog.recordBestEffort({
  tenantId: user.tenantId,
  actor: user.email,
  action: 'decision.compute',
  subjectId: body.subjectId,
  severity: 'INFO',
  payload: { situationId: body.situationId, firedEffects: result.state.firedEffects.length },
});
```

Note: no `try/catch`. `recordBestEffort` does not throw — it returns a synthesized event on failure. The caller can inspect `payload._durable: false` to know that the event was not persisted, but the call site does not need to.

Events that use best-effort mode:

- `decision.compute` — a decision was computed (the decision itself is recorded in the `DecisionRecord` table; the audit event is supplementary).
- `decision.persist` — a decision was persisted (same rationale).
- `page.view` — page-view telemetry (if recorded).
- Any future event where the operation's correctness does not depend on the audit being recorded.

### What is explicitly NOT allowed

- Using `recordBestEffort()` for a security-sensitive operation. The `waitlist.approve` event must use `record()`. A code review checklist item is added: "does this audit event record a privileged action? If yes, use `record()`."
- Catching `AuditPersistenceError` and proceeding without rolling back. The catch must roll back the action; otherwise the audit failure is silently swallowed. (An operator dashboard can show recent `AuditPersistenceError`s; the catch is the last line of defence, not a place to hide the error.)
- Calling `record()` without a `try/catch`. If the call is at the top of a route handler and the error propagates to Next.js's error handler, the action has already been committed (e.g., the `User` row was created before `record()` was called). The `record()` call must be **before** the commit, OR the commit must be in the same transaction as the `record()`. (Prisma's `$transaction` can group them; the route handler pattern above shows the rollback approach.)

### What is unchanged

- The `AuditEvent` shape (per `contracts/audit.md`).
- The Prisma `AuditEvent` table (per ADR 0006).
- The audit payload sanitizer (per §34 SEC check `audit-payload-sanitizer`).
- The tenant scoping on reads (per ADR 0012 — `forSubjectInTenant` for non-admin, `forSubject` for admin with `platformWide=true`).
- The `InMemoryAuditLog` implementation — its `record()` calls `recordBestEffort()` (in-memory never fails, so the contract is satisfied vacuously).

## Alternatives considered

- **Always durable (`record()` only).** Rejected: too strict for informational events. The `decision.compute` event is emitted on every decision; if the database is briefly unavailable, every decision would fail — which is wrong (the decision itself is still computed and returned; only the supplementary audit failed). Informational events should not break the request.
- **Always best-effort (`recordBestEffort()` only).** Rejected: loses audit integrity. The original problem. A failed audit write for `waitlist.approve` is silently swallowed, and the platform cannot answer "who approved this user?". The whole point of recording privileged actions is that the recording is *required*.
- **A single method with a `durable: boolean` parameter.** Rejected: makes the durability a runtime choice rather than a call-site choice. A future maintainer could flip the flag from `true` to `false` and silently downgrade a privileged audit. Two methods make the durability a structural choice that is harder to regress.
- **Use the database transaction as the durability boundary (call `record()` inside the same Prisma `$transaction` as the action).** Considered and partly accepted: this is the *correct* pattern when the action and the audit can be in the same transaction. But not every action can be transactional (e.g., NextAuth's sign-in is not a Prisma transaction; the invitation-token email is sent out-of-band). The two-method split accommodates both cases: transactional callers can use `record()` inside the transaction; non-transactional callers can use `record()` with a manual rollback.
- **Queue the audit event for asynchronous persistence.** Rejected: an async queue is a "best-effort with extra steps". The queue itself can fail (the queue's storage can be unavailable), and the queue introduces a lag between the action and the audit. For security-sensitive actions, the audit must be persisted (or the action rolled back) before the response is sent. The synchronous `record()` with rollback is the simplest correct pattern.
- **Use an external SIEM / log aggregator.** Considered: a SIEM is a *consumer* of the audit trail, not a *replacement* for the database audit trail. The platform can forward `AuditEvent`s to a SIEM (e.g., via a Prisma `create` after-hook that also emits to a log shipper), but the database is the source of truth. A SIEM adds operational complexity without removing the need for durable in-DB recording.

## Consequences

- **Security-sensitive actions fail loudly if audit cannot persist.** A `waitlist.approve` that cannot be audited returns 503 (Service Unavailable) and rolls back the user creation. The operator sees the failure in the route's response and in the application logs (the `AuditPersistenceError` is logged before the rollback).
- **Informational events never break the request.** A `decision.compute` that cannot be audited proceeds; the decision is still computed and returned. The synthesized `AuditEvent` (with `payload._durable: false`) is returned to the caller, which can choose to log it (most callers do not).
- **The audit trail has no silent holes for privileged operations.** A `waitlist.approve` audit event is either in the database, or the approval was rolled back — there is no third state. The operator can trust the audit trail for privileged operations.
- **The audit trail may have holes for informational events.** This is acceptable and documented. The `decision.compute` event is supplementary to the `DecisionRecord` (which is the authoritative record of the decision); a missing `decision.compute` event does not affect the integrity of the `DecisionRecord`.
- **The `_durable: false` flag is visible in the audit payload.** A consumer that reads the audit log (e.g., the admin audit panel) can choose to filter synthesized events or display them with a "non-durable" indicator.
- **Callers must use the right method.** A future maintainer who uses `recordBestEffort()` for a privileged action introduces a silent regression. The runtime test suite does not currently test for this (it is a code-review concern); a future static check could grep for `recordBestEffort(` and verify the surrounding `action:` is in the informational whitelist. (This is noted as a future improvement; not part of this ADR.)
- **`AuditPersistenceError` is exported from `src/platform/audit/AuditLog.ts`.** Callers import it for `instanceof` checks. The error's `cause` field carries the underlying database error for diagnostics.

## Invariants affected

- **I6** (provenance) — the audit trail is **durable for privileged operations**. A privileged action either has its audit event in the database, or the action was rolled back. The audit trail can be trusted to answer "who did this privileged thing?".
- **I5** — unaffected directly. The decision engine's provenance is unchanged; this ADR is about the platform-foundation audit log, not the kernel's `Provenance[]`.
- **I12** (capability boundaries) — strengthened in practice. A privileged action that cannot be audited is refused; the capability to perform the action is contingent on the capability to record it.
- **I9** (tenant data isolation) — unaffected directly. The audit reads are tenant-scoped per ADR 0012; this ADR is about the durability of writes, not the scoping of reads.
- **I18** — this ADR is an authorization-sprint decision; the kernel architecture is unchanged. The `AuditEvent` type, the Prisma `AuditEvent` table, and the `contracts/audit.md` contract are unchanged. Only the `AuditLog` implementation's method surface changed (one method → two methods).

## Migration implications

- `src/platform/audit/AuditLog.ts` — the `AuditLog` interface gains a second method (`recordBestEffort`). The existing `record()` method now throws `AuditPersistenceError` on failure instead of returning a synthesized event. The `AuditPersistenceError` class is exported.
- `src/lib/auth/audit.ts` — the `recordAuditBestEffort()` helper continues to call `auditLog.recordBestEffort()`. A new `recordAuditDurable()` helper (or a direct `auditLog.record()` call) is used by security-sensitive route handlers.
- Route handlers for `waitlist.approve`, `waitlist.reject`, `auth/set-password`, `auth/signin`, `auth/role-change` — updated to use `record()` with `try/catch` and rollback. The exact rollback pattern depends on the route (some can use a Prisma `$transaction`; some need a manual compensating delete).
- `POST /api/state` (`decision.persist`) — uses `recordBestEffort()`. The decision is computed and returned regardless of audit success. The `DecisionRecord` itself is the authoritative record; the audit event is supplementary.
- Existing `AuditEvent` rows in the database (if any) are unaffected — the schema is unchanged.
- The runtime test suite does not currently include a durability test (it is hard to simulate a DB failure in a runtime test without mocking). A future improvement could add a `--inject-audit-failure` flag to the dev server for testing rollback behaviour.
- Future revisions (e.g., moving to a write-ahead audit log, adding a SIEM forwarder, adding a static check for `recordBestEffort` misuse) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 25 (security), section 31 (I6).
- `contracts/audit.md` — the `AuditEvent` contract; the audit-trail durability requirement.
- `architecture/invariants.md` — I6 (provenance — audit trail is durable for privileged operations).
- `decisions/0008-waitlist-approval-flow.md` — the waitlist approval events that use durable recording.
- `decisions/0009-invitation-tokens.md` — the `SET_PASSWORD` event that uses durable recording.
- `decisions/0011-rate-limiting-and-csrf.md` — the rate-limit and CSRF events that use best-effort recording.
- `decisions/0013-decision-integrity-separation.md` — the `decision.compute` / `decision.persist` events that use best-effort recording (the `DecisionRecord` is authoritative; the audit event is supplementary).
- `src/platform/audit/AuditLog.ts` — `record()` (durable, throws), `recordBestEffort()` (best-effort, synthesized on failure), `AuditPersistenceError`.
- `src/lib/auth/audit.ts` — `recordAuditBestEffort()` helper.
