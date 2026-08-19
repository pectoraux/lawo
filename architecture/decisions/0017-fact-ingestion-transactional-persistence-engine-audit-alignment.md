# ADR 0017 — Fact Ingestion Contract + Transactional Decision Persistence + Engine Audit Alignment

**Status:** ACCEPTED
**Date:** 2026-08-19
**Decider:** Principal Architect
**Supersedes:** none
**Superseded by:** —
**References:** ADR 0013 (decision integrity), ADR 0014 (audit durability), contracts/fact.md, contracts/decision.md

## Context

The authorization sprint (ADRs 0012–0016) fixed the tenant authorization boundary at the API level, but an independent audit identified four remaining gaps:

1. **AUTHZ-002 was testing the wrong thing.** The runtime test asserted that User A "cannot see" tenant B's decision via the API response. But the API response does not include `tenantId`, so the test could pass even if a record was written into tenant B — it would just be invisible to the read path. A broken read path could make a write test appear to pass.

2. **Submitted facts retained their own `tenantId`.** The `Fact` primitive has its own `tenantId` field. The server overrode the request-level `tenantId` from the session, but did NOT normalize the individual `Fact` objects inside `body.facts`. A tenant-A user could submit facts with `tenantId: tenantB` and they flowed into the engine unchecked.

3. **Decision persistence was non-transactional.** `/api/state` wrapped the persist + audit in a `try/catch`, used `recordAuditBestEffort()`, and returned HTTP 200 even when persistence failed. The caller believed the decision was persisted when it wasn't.

4. **The DecisionEngine had a contradictory audit contract.** `AuditLog.record()` throws `AuditPersistenceError` (ADR 0014), but the DecisionEngine caught and swallowed audit failures per its old "audit recording MUST NEVER throw" header. Two conflicting audit contracts in the same codebase.

## Decision

### 1. AUTHZ-002 strengthened to query the DB directly

The runtime test now queries `db.decisionRecord.findFirst({ where: { subjectId, tenantId: FIXTURE.tenantB } })` to authoritatively prove no record was written into tenant B. It also verifies the record WAS persisted in tenant A. The API response is no longer trusted as the sole proof.

### 2. Fact ingestion contract: API-supplied facts are untrusted input

API-supplied facts are **untrusted input**. The server normalizes every submitted fact's `tenantId` to the authenticated session's `tenantId`. A tenant-A user cannot manufacture facts that claim to belong to tenant B.

The fact's `truthLevel`, `attribute`, `value`, and `observedAt` are preserved — the caller may assert a fact at any truth level; the engine and UI surface this transparently. The `subjectId` on each fact is also normalized to the request's `subjectId` (facts are about the request's subject).

This does NOT affect server-owned facts (loaded from `FactRecord` via the evidence graph). Those are loaded by the ContextBuilder from the DB and carry their authoritative `tenantId`. The normalization applies ONLY to facts submitted via the API request body.

### 3. Transactional decision persistence

When `persist: true`, `/api/state` now:
1. Persists the `DecisionRecord` to the DB.
2. Persists a **durable** audit event via `recordAudit()` (not `recordAuditBestEffort()`).
3. If the audit write fails, **rolls back** the decision record (deletes it) so no un-audited decision persists.
4. Returns HTTP 500 with `persisted: false` and the error detail if either step fails.
5. Returns HTTP 200 with `persisted: true` only when both the decision AND the audit event are durably persisted.

The response now explicitly distinguishes:
- `persisted: false` (or absent) — computed only, not persisted
- `persisted: true` — computed AND durably persisted (decision + audit)
- HTTP 500 — computed but persistence failed (caller knows to retry)

### 4. DecisionEngine audit contract aligned

The DecisionEngine no longer injects or calls an `AuditLog`. It constructs the `AuditEvent[]` array and returns it to the caller. The caller (the route handler) is responsible for persisting the audit event via the appropriate `AuditLog` method:
- `record()` for durable persistence (throws on failure)
- `recordBestEffort()` for non-durable informational events

This removes the fire-and-forget contract that conflicted with `AuditLog.record()`. The engine is now audit-log-agnostic — it computes; the route handler decides the durability policy. The `auditLog` parameter on `createDecisionEngine()` is accepted for backward compatibility but is no longer used.

## Alternatives Considered

- **For fact normalization:** validate facts against server-owned fact records (reject any fact whose `tenantId` doesn't match the session). Rejected: too rigid — callers legitimately submit new facts they haven't persisted yet. Normalization (override, don't reject) is the correct untrusted-input pattern.

- **For transactional persistence:** use a Postgres transaction (BEGIN ... COMMIT) wrapping both writes. Rejected for now: Prisma's `$transaction` API would work, but the rollback-on-audit-failure pattern achieves the same integrity guarantee with simpler code. A future improvement could use a true DB transaction.

- **For the engine audit contract:** make the engine call `record()` durably and let it throw. Rejected: the engine is a pure computation layer; it should not have IO side effects. Persisting audit events is a route-handler concern (the route handler knows the durability policy appropriate for the operation).

## Consequences

- **Fact integrity:** a tenant-A user cannot inject facts claiming to belong to tenant B. All submitted facts carry the session's `tenantId`.
- **Persistence honesty:** the API never returns HTTP 200 while persistence silently failed. The `persisted` field is a meaningful signal.
- **Audit consistency:** there is now exactly one audit contract. `AuditLog.record()` throws; `recordBestEffort()` doesn't. The engine doesn't call either. Route handlers choose.
- **Breaking change:** the `/api/state` response now includes a `persisted` boolean. Clients that don't check it are unaffected (they get the state + provenance as before). Clients that persist decisions should check `persisted === true` before treating the decision as durably saved.

## Invariants Affected

- **I6 (provenance):** strengthened — the audit trail for persisted decisions is now durable, not fire-and-forget.
- **I9 (tenant data):** strengthened — submitted facts are normalized to the session tenant, closing the fact-level injection vector.

## Migration Implications

- The `createDecisionEngine(auditLog)` signature is preserved but the `auditLog` parameter is ignored. Any caller passing an audit log will still compile; the audit log is simply not used by the engine.
- The `/api/state` response gains a `persisted` field. Existing clients that ignore unknown fields are unaffected.

## References

- ADR 0013 — Decision integrity (DecisionRequest vs DecisionRecord)
- ADR 0014 — Audit durability (record vs recordBestEffort)
- `architecture/contracts/fact.md` — Fact primitive contract
- `architecture/contracts/decision.md` — DecisionEngine contract
- `src/app/api/state/route.ts` — implementation
- `src/intelligence/decision/DecisionEngine.ts` — engine (audit-log-agnostic)
- `tests/runtime-security/run.ts` — AUTHZ-002 (DB-verified), INTEGRITY-004/005/006
