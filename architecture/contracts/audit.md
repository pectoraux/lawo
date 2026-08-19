# Contract — Audit (AuditEvent Trail)

> Family: Foundation.
> Implementation surface: `src/platform/audit/AuditLog.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The audit subsystem records every significant action and decision so the platform remains accountable (section 25, section 27). Audit events are immutable where appropriate; they form the historical backbone that supports I13 (historical decisions remain reproducible) and I6 (every material decision has provenance).

## Inputs

- `AuditEvent` — `{ id, tenantId, actor, action, subjectId?, timestamp, severity, payload }`
  - `severity ∈ { INFO, WARN, ERROR, CRITICAL }`
  - `actor` is the principal that performed the action (a user, an agent, or an internal system)
  - `payload` is a structured `Record<string, unknown>` carrying the action-specific context

Events are emitted by:

- `DecisionEngine` — `DECISION_PRODUCED`, `NO_RULES_FIRED`, `PROVENANCE_INCOMPLETE` (error)
- `ActionModel` — `ACTION_DISPATCHED`, `ACTION_RESULT_SUCCESS`, `ACTION_RESULT_PARTIAL`, `ACTION_RESULT_FAILURE`
- `Extension SDK` — every privileged call (`READ`, `WRITE`, `INVOKE`, `ACT_UPON`)
- `Tenant` — `TENANT_BOUNDARY_VIOLATION`, `UNAUTHORIZED_PUBLISH`
- `PackageRegistry` — `PACKAGE_LOADED`, `PACKAGE_SIGNATURE_INVALID`, `PACKAGE_ROLLBACK`

## Outputs

- An append-only audit log queryable by `tenantId`, `actor`, `severity`, time range
- `GET /api/audit?limit=50` → `{ events: AuditEvent[] }`
- Audit events referenced by `Provenance` and by `decisionId` for cross-linking

## Errors

- `AuditWriteError` — append failed; the calling action is rolled back (audit-on-success is mandatory for material actions)
- `AuditQueryError` — caller lacks tenant scope to query the requested range
- `AuditImmutabilityError` — caller attempted to mutate or delete an event

Errors are structured.

## Versioning

- The `AuditEvent` shape is versioned. Additive changes (new `severity` values, new optional fields) are allowed; renames or removals require an ACO.
- The audit log schema is independent of any single package; package versions do not change the audit contract.

## Security

- Events are tenant-scoped; a tenant can read only its own events (and global events that explicitly affect it).
- The log is append-only; events cannot be edited or deleted except by an explicit, ACO-controlled retention policy.
- Sensitive payloads are redacted according to data classification; secrets never appear in payloads (per section 25).

## Provenance

Audit events are not decisions, but they are the substrate that supports provenance. Each `Provenance` entry can be cross-linked to the audit events that fired during decision construction. Together they answer: "What did we know? When did we know it? Which version did we use? Why did we produce this answer?" (per I6).

## Idempotency

- Material actions are audit-on-success: the audit event is written only after the action completes. Re-running the action with the same idempotency key returns the prior result and does not produce a duplicate event.
- Read-only audit queries are pure functions of `(caller_tenant, query)`.

## Failure Semantics

- If the audit write fails for a material action, the action is rolled back; the platform never accepts "succeeded but not audited" for material outcomes.
- If the audit log is unavailable for read queries, the API returns a structured error rather than partial or stale data.
- Retention policies may archive old events to cold storage but never delete them.

## Invariants Enforced

- **I6** — audit supports provenance.
- **I9** — tenant-scoped audit reads.
- **I12** — every privileged extension call recorded.
- **I13** — historical decisions reconstructable via cross-link with `decisionId`.
- **I14** — audit contract preserved across releases unless versioned.
