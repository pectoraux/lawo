# Contract — Rule (RuleEngine + RuleIR)

> Family: EVALUATE.
> Implementation surfaces: `src/kernel/rules/RuleEngine.ts`, `src/kernel/rules/conditionEval.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `RuleEngine` evaluates a single `Rule` (or a set) against `Fact[]` at a given `asOf` and returns a deterministic `RuleEvaluationResult`. It is the only authoritative source of "did this rule fire?" in the platform. Authoritative legal text remains the source; `RuleIR` is the canonical machine-readable representation linked to that source (section 11).

The engine is **deterministic**: it performs no IO, holds no hidden state, and never consults an LLM (per I5).

## Inputs

- `rule: Rule` (or `rules: Rule[]`) — carrying `ruleIr`, `temporal`, `truthLevel`, `jurisdictionId`, `authorityId`, `sourceId`, `packageId`
- `facts: Fact[]` — the assertions to evaluate against
- `asOf: string` — ISO date; rules whose `temporal.validFrom..validTo` does not cover `asOf` are skipped (per I7)

The `RuleIR` itself contains:

- `conditions: ConditionNode` — a boolean expression tree over facts (`leaf` with `operator` and `value`, or `and`/`or`/`not` composition)
- `exceptions: ConditionNode[]` — if any is true, the rule does not apply
- `effects: RuleEffect[]` — rights/obligations/permissions/restrictions/fees/options/consequences granted or denied, each with optional `amount`
- `definitions?`, `references?`, `interpretiveStatus?`

See `schemas/rule-ir.schema.md` for the full schema.

## Outputs

A `RuleEvaluationResult` containing:

- `ruleId`
- `matched: boolean` — conditions true and no exception true
- `skippedDueToException: boolean`
- `firedEffects: RuleEffect[]` — the effects that applied (empty if not matched)
- `truthLevel: TruthLevel` — inherited from the rule
- `calculation: CalculationStep[]` — auditable intermediate steps (input, output, optional `ruleClause`)

## Errors

- `MalformedRuleIRError` — `conditions` is not a valid tree, unknown operator, missing `value`
- `TemporalSkipError` (informational) — rule's `validFrom..validTo` does not cover `asOf`; not raised, recorded as `matched=false` with a marker
- `FactResolutionError` — a referenced fact attribute is absent or of wrong type

## Versioning

- The `RuleIR` shape is versioned. Additive changes (new optional fields, new operators added alongside existing ones) are allowed; renames or removals require an ACO and a major bump.
- The runtime evaluation algorithm is deterministic and version-tagged in the result so historical evaluations remain reproducible (per I13).

## Security

- The engine reads only the facts passed to it; it cannot perform additional tenant queries.
- Evaluated rules are always scoped upstream by `ContextBuilder`; the engine itself has no tenant boundary to enforce but assumes facts are already scoped (per I9).

## Provenance

The engine's `calculation` array feeds `ProvenanceBuilder`. Each fired rule carries its own `ruleVersion`, `sourceId`, `authorityId`, which downstream provenance preserves. A rule that did not fire still appears in `StateSnapshot.applicableRules` but contributes no provenance entry.

## Idempotency

`evaluate(rule, facts, asOf)` is a pure function. Same inputs → identical output, byte-for-byte. Determinism is a hard contract (per I5).

## Failure Semantics

- A malformed rule fails the entire evaluation with `MalformedRuleIRError`; the engine does not silently skip.
- A fact of the wrong type raises `FactResolutionError`; the engine does not coerce.
- Evaluation never throws on a "no match"; it returns `matched=false` with empty `firedEffects`.

## Invariants Enforced

- **I5** — no LLM in the path; deterministic.
- **I6** — produces `calculation` for provenance.
- **I7** — temporal coverage enforced via `asOf`.
- **I8** — rule `truthLevel` flows through; T4/T5 rules cannot produce authoritative obligations.
- **I13** — algorithm version tagged; historical evaluations reproducible.
- **I14** — `RuleIR` contract preserved across releases unless versioned.
