# Contract — Procedure (ProcedureEngine)

> Family: PLAN.
> Implementation surface: `src/procedures/ProcedureEngine.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `ProcedureEngine` answers "what actually happens next in the institutional process?" It is distinct from the rule engine (which answers "what is legally allowed/required?"). A procedure must be able to represent sequence, branching, actors, location, required documents, accepted alternatives, expected outputs, fees, timing, next step, and exception paths (section 8).

The engine operates on the generic `Procedure` shape and is domain-agnostic (per I1, I4).

## Inputs

- `procedure: Procedure` — `{ id, code, label, situationId, steps: ProcedureStep[] }`
- `currentState: string` — the id of the state the user is currently in
- `event: string` (for `nextStep`) — the event that triggers a transition

Each `ProcedureStep` may carry: `requiredDocuments`, `acceptedAlternatives`, `expectedOutputs`, `fees` (`{ label, amount, currency }`), `timing`, `nextStep`, `exceptionPath`.

## Outputs

- `currentStep(procedure, currentState)` → `ProcedureStep | undefined`
- `nextStep(procedure, currentState, event)` → `ProcedureStep | undefined`

The returned step preserves all optional fields (documents, fees, timing, exception path) for downstream UI/action consumers.

## Errors

- `UnknownStateError` — `currentState` not found in the procedure's states
- `InvalidEventError` — `event` does not correspond to a transition from `currentState`
- `ProcedureShapeError` — the procedure is malformed (orphaned `nextStep`, missing states)

Errors are structured and surface the offending id.

## Versioning

- The `Procedure` and `ProcedureStep` shapes are versioned. Additive changes are allowed; renames/removals require an ACO.
- Procedures are versioned packages (per I10); changes to a published procedure ship a new version, never an in-place edit.

## Security

- Procedures are package data; they do not carry tenant-specific secrets.
- The engine performs no IO and does not read tenant databases.
- Tenant scope is enforced upstream by the caller; the engine operates purely on the supplied procedure and state.

## Provenance

Procedures themselves are not decisions, so they do not carry `Provenance`. However, when a procedure step produces a material decision (e.g., a fee payment), the consuming action records provenance through `ActionModel` (see `action.md`).

## Idempotency

`currentStep` and `nextStep` are pure functions of `(procedure, currentState, event)`. Same inputs → identical output (per I13).

## Failure Semantics

- If `currentState` is terminal, `nextStep` returns `undefined` rather than raising.
- If `event` does not match a transition, `nextStep` returns `undefined` and surfaces a `InvalidEventError` only when the caller opts into strict mode.
- A malformed procedure is rejected at package-load time, before any consumer can reach it.

## Invariants Enforced

- **I1, I4** — engine is domain- and situation-agnostic; situations live in situation packs.
- **I6** — provenance is delegated to the action layer for material decisions.
- **I13** — deterministic step resolution.
- **I14** — procedure shape preserved across releases unless versioned.
