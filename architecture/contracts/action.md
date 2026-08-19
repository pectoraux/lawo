# Contract — Action (ActionModel)

> Family: ACT.
> Implementation surface: `src/kernel/actions/ActionModel.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `ActionModel` represents recommended actions and their lifecycle. Every recommended action is representable as:

```
Decision → Action → Preconditions → Execution → Result → Evidence → Updated State
```

The goal is to move the user's real-world state forward correctly, not merely to "answer the user" (section 28).

The model is domain-agnostic. Action kinds (`FILE`, `PAY`, `NOTIFY`, `NAVIGATE`, `SUBMIT`, `GENERATE_DOCUMENT`, `REQUEST_INFO`, `REPORT`, `HANDOFF`) are generic verbs; vertical semantics live in packages (per I1, I3).

## Inputs

- `Action` — `{ id, code, label, description?, kind, preconditions?, executionHint?, expectedResult? }`
- `Decision` context — the snapshot that motivates the action (carries `subjectId`, `jurisdictionIds`, `asOf`, applicable rules)
- Optional `executionPayload` — parameters supplied by the caller (e.g., a payment amount, a target office)

`preconditions` are `ConditionNode` trees evaluated against the decision's facts; a precondition that fails blocks execution.

## Outputs

- A `Result` object containing: the executed action id, the kind, the outcome (`SUCCESS`, `PARTIAL`, `FAILURE`), the produced `Evidence` (e.g., a filing receipt), and the `UpdatedState` reference (a new snapshot id or a delta).
- `Evidence` produced by the action is attached to the user's record and referenced by future provenance.

## Errors

- `PreconditionsNotMetError` — preconditions failed; execution not attempted
- `ExecutionFailureError` — the external system returned an error (e.g., the payment gateway declined)
- `PartialResultError` — the action partially succeeded (e.g., the document was generated but the filing failed)
- `ActionNotAuthorizedError` — the caller lacks the capability to perform the action (per I12)

Errors are structured and never swallowed.

## Versioning

- The `Action` shape and the kind enum are versioned. Adding a new kind is allowed via ACO; removing or renaming a kind requires a major bump and a migration.
- External integration contracts (e.g., a government filing connector's request/response shape) are versioned per connector.

## Security

- Every action requires a capability check (`ACT_UPON` for the target entity, `INVOKE` for any connector) before execution (per I12).
- Actions are tenant-scoped; cross-tenant actions require explicit authorization.
- External calls (e.g., to a payment gateway) use scoped credentials, never the platform's own identity.

## Provenance

Every executed action records its decision id, the action id, the executed version, the inputs, the result, and the produced evidence. This becomes part of the audit trail and is referenceable by future `Provenance` entries (per I6).

## Idempotency

- Actions carry an `idempotencyKey` (derived from the decision id and action id). Re-invoking with the same key returns the prior result rather than re-executing.
- For side-effecting actions (e.g., payments) the key prevents duplicate execution; for read-only actions the key is informational.

## Failure Semantics

- If preconditions fail, the action is not executed; the engine returns `PreconditionsNotMetError` with the failing condition.
- If execution fails midway, partial results are persisted with explicit `PARTIAL` status and the action is retryable with the same idempotency key after correction.
- A failed action never updates the snapshot's authoritative state; only `SUCCESS` (and where documented, `PARTIAL`) actions update state.

## Invariants Enforced

- **I1, I3** — action kinds are generic verbs; vertical semantics live in packages.
- **I6** — every executed action produces evidence and provenance.
- **I12** — capability checks enforced before execution.
- **I13** — idempotency keys make actions replayable.
- **I14** — action shape preserved across releases unless versioned.
