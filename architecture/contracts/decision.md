# Contract — Decision (DecisionEngine)

> Family: EVALUATE.
> Implementation surface: `src/intelligence/decision/DecisionEngine.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `DecisionEngine` orchestrates a complete material decision: it builds context, evaluates rules, computes state, attaches provenance, and emits audit events. It is the top-level entry point used by `/api/state` and is the only sanctioned way to produce an authoritative `StateSnapshot` (per I5, I6).

The orchestrator itself contains no domain logic. It wires engines together; it does not invent conclusions (per I1).

## Inputs

- `request: ContextRequest` — the raw request (subject, location, asOf, situationId, facts, jurisdictionIds, objective, tenantId)
- `registry: PackageRegistry` — the source of packages, rules, jurisdictions, authorities, sources

## Outputs

A result object containing:

- `state: StateSnapshot` — the authoritative state (per I6)
- `provenance: Provenance[]` — one entry per fired rule, including the `decisionId`
- `audit: AuditEvent[]` — at minimum a `DECISION_PRODUCED` event; other events emitted by engines in the pipeline

## Errors

- `ContextError` — wrapped from `ContextBuilder`
- `RuleEvaluationError` — wrapped from `RuleEngine`
- `ProvenanceIncompleteError` — when a fired rule lacks sufficient source/authority/facts to construct provenance (per I6)
- `TenantBoundaryError` — re-asserted at this layer as defense-in-depth (per I9)

Errors are structured and never silently swallowed.

## Versioning

The orchestration result object is versioned. Additive changes (new optional audit events) are allowed. Renames or removals require an ACO.

## Security

- Tenant isolation is enforced upstream by `ContextBuilder` and re-asserted here (per I9).
- The engine never reads raw tenant databases directly; it operates through `PackageRegistry` and the supplied request.
- Outputs are scoped to the caller's tenant and never leak cross-tenant facts.

## Provenance

Every decision carries full provenance (per I6). The `decisionId` is generated deterministically from `(request, package_versions, as_of)` so the same inputs always produce the same id; this supports I13 (historical reproducibility). Each `Provenance` entry records `ruleId`, `ruleVersion`, `source`, `authority`, `facts`, `evidence`, `calculation`, `assumptions`, `truthLevel`, `asOf`, `producedAt`.

## Idempotency

`decide(request, registry)` is a pure function of its arguments. Re-running with the same request and the same package versions reproduces the same `state` and `provenance` (modulo `producedAt` timestamps, which are informational only). This is the basis for I13.

## Failure Semantics

- If any sub-step raises, the orchestrator surfaces the structured error; it never returns a partial decision.
- If no rules fire, the decision still completes with empty `firedEffects` and empty `provenance`; the audit event records `NO_RULES_FIRED`.
- A failure mid-decision does not mutate persisted state; persisted snapshots are written only after successful construction.

## Invariants Enforced

- **I5** — no LLM in the path; deterministic.
- **I6** — every decision has provenance; absence raises `ProvenanceIncompleteError`.
- **I7** — `asOf` is honoured throughout.
- **I9** — tenant isolation re-asserted.
- **I13** — `decisionId` is deterministic; historical decisions reproducible.
- **I14** — contract preserved across releases unless versioned.
