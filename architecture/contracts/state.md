# Contract — State (StateEngine)

> Family: EVALUATE.
> Implementation surface: `src/kernel/state/StateEngine.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `StateEngine` computes a `StateSnapshot` from a `ContextBundle`, an optional `Situation`, and a set of `Rule`s. It is the single authoritative source of "what is currently true, permitted, required, owed, and what options exist" for a subject at a point in time.

The state engine is a first-class subsystem (section 4). It must be deterministic and must not bury state calculation inside conversational logic (per I5).

## Inputs

- `bundle: ContextBundle` — the resolved context produced by `ContextBuilder`
- `situation: Situation | undefined` — optional situation being navigated (per I4)
- `rules: Rule[]` — the rules to evaluate (already filtered to the applicable jurisdictions and `asOf`)
- `ruleEngine: RuleEngine` — injected evaluator (dependency inversion)

## Outputs

A `StateSnapshot` containing:

- `situationId`, `subjectId`, `jurisdictionIds`, `asOf`, `computedAt`
- `applicableRules` — rules that were in scope
- `firedEffects` — `FiredEffect[]` (ruleId, effect, truthLevel)
- `options`, `obligations`, `rights`, `permissions`, `restrictions`
- `truthLevel` — the cumulative truth level (weakest-link rule)
- `provenance: Provenance[]` — one per fired rule

## Errors

- `EmptyContextError` — bundle missing required resolved jurisdictions
- `RuleCompilationError` — a rule's `RuleIR` is malformed (deferred to the rule engine's contract)
- `TemporalConflictError` — a rule's `validFrom` does not cover `asOf`

Errors are structured and never masked.

## Versioning

`StateSnapshot` is a public contract. Additive changes (new optional fields, e.g., a future `tags` field) are allowed; renames or removals require an ACO and a major version bump. Snapshots persisted by older versions must remain readable.

## Security

- The engine only operates on facts already scoped to the caller's tenant by the upstream `ContextBuilder`; it does not perform additional tenant filtering but assumes isolation upstream (per I9).
- Output never leaks facts from other tenants; provenance references only facts in scope.
- The engine performs no IO, so it cannot leak data through logging.

## Provenance

Every fired effect is paired with a `Provenance` entry built by `ProvenanceBuilder` (see `decision.md`). Snapshots without provenance are invalid (per I6). Provenance records the ruleId, ruleVersion, source, authority, facts, evidence, calculation, assumptions, truthLevel, asOf, producedAt.

## Idempotency

`compute(bundle, situation, rules, ruleEngine)` is a pure function of its arguments. Re-running with the same bundle, situation, rules, and engine yields byte-identical output (modulo `computedAt`, which is informational only). Snapshots are reproducible across runs (per I13).

## Failure Semantics

- If no rules fire, the snapshot contains empty `firedEffects`, empty `obligations`, etc. — the engine never fabricates effects.
- If a situation is supplied but the current state is not terminal, the snapshot records the active state without forcing a transition.
- If a rule raises, the snapshot is not produced; the error is surfaced with the offending `ruleId`.

## Invariants Enforced

- **I4** — situation-specific behaviour stays in the situation pack; the engine consumes the generic `Situation` shape.
- **I5** — the engine is deterministic; no LLM is in the path.
- **I6** — every snapshot has provenance.
- **I7** — every evaluated rule's `temporal` range must cover `asOf`.
- **I8** — community-level facts cannot produce authoritative obligations (the rule's `truthLevel` governs).
- **I13** — snapshots are reproducible.
