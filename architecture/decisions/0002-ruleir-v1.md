# ADR 0002 — RuleIR v1

- **Status:** ACCEPTED
- **Date:** Initial constitution
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Section 11 mandates a canonical, machine-readable Rule Intermediate Representation (`RuleIR`) that captures jurisdiction, authority, source, effective dates, conditions, exceptions, definitions, rights, obligations, permissions, restrictions, consequences, references, discretion, and interpretive status. Authoritative legal text remains the source of truth; `RuleIR` is the executable representation linked to it.

Without a canonical representation the platform would either (a) execute free-form prose (rejected: not deterministic, not inspectable) or (b) have each package invent its own rule encoding (rejected: no shared rule engine, no provenance, no composability).

Section 12 mandates four rule types — `DETERMINISTIC`, `CONDITIONAL`, `DISCRETIONARY`/`INTERPRETIVE`, `PREDICTIVE` — and forbids silently transforming discretionary/predictive judgments into deterministic legal facts. Every decision must expose its epistemic status.

## Decision

Adopt `RuleIR` (v1) as the canonical machine-readable rule representation, with:

- `id: string` — stable id of this `RuleIR` instance
- `ruleId: string` — the parent `Rule` this `RuleIR` belongs to
- `conditions: ConditionNode` — a boolean expression tree over facts. A `leaf` carries `{ fact, operator, value }` where `operator ∈ { eq, neq, gt, gte, lt, lte, in, contains, exists }`. Composition nodes are `and` (children array), `or` (children array), and `not` (single child).
- `exceptions: ConditionNode[]` — if any element evaluates true, the rule does not apply (empty array allowed)
- `effects: RuleEffect[]` — each with `kind ∈ { RIGHT, OBLIGATION, PERMISSION, RESTRICTION, FEE, OPTION, CONSEQUENCE }`, a `code`, a `label`, an optional `detail`, and an optional `amount { value, currency, basis? }`
- `definitions?: Record<string, Definition>` — term-to-meaning map (`Definition = { term, meaning }`)
- `references?: string[]` — `sourceId` references to the underlying authoritative text
- `interpretiveStatus?: 'SETTLED' | 'CONTESTED' | 'AMBIGUOUS'` — epistemic status of the rule's interpretation

### Evaluation algorithm

The `RuleEngine` evaluates `RuleIR` deterministically: it walks the `conditions` tree (depth-first, short-circuit on `and`/`or`), evaluates `exceptions`, and — if matched — produces `firedEffects`. The engine exposes the `truthLevel` of the rule (T0–T5, inherited from the parent `Rule`) and a `calculation: CalculationStep[]` trace that records each step (input, output, optional `ruleClause`) for `ProvenanceBuilder`.

The result (`RuleEvaluationResult`) carries `ruleId`, `matched`, `skippedDueToException`, `firedEffects`, `truthLevel`, `calculation`. The algorithm version is recorded so historical evaluations remain reproducible (per I13).

### Authoritative text relationship

The authoritative legal text remains the source; `RuleIR` is generated from that source by a rule-authoring workflow (which may be LLM-assisted for extraction but never LLM-authoritative, per I5). The compiled runtime representation is generated from `RuleIR`. **Free-form prose is never the executable representation** (section 11).

## Alternatives considered

- **Free-form prose as executable representation.** Rejected (section 11): not deterministic, not inspectable, breaks provenance. Prose cannot be cross-versioned, cannot be unit-tested, cannot be audited.
- **Per-package rule encodings.** Rejected: no shared rule engine, no cross-package provenance, no historical reproducibility (per I13). Each package would re-implement evaluation differently.
- **Boolean-only conditions without exceptions.** Rejected: real legal rules distinguish "rule fires" from "rule fires but exception applies"; collapsing them loses material information. Border-crossing rules typically have many exception clauses; representing them as nested `not` conditions obscures the legal intent.
- **Single effect kind ("EFFECT").** Rejected: cannot distinguish rights from obligations, permissions, restrictions, fees, options, consequences — required by section 11. The UI needs the kind to render appropriate badges and the action layer needs it to choose correct actions.
- **No `interpretiveStatus`.** Rejected: contested and ambiguous rules must be visible to the user as such (per section 12). Hiding the status silently promotes interpretations to enacted text.

## Consequences

- Every rule ships as `RuleIR` linked to its `sourceId`. Authoring workflows produce `RuleIR` from authoritative text and link them via `references`.
- `RuleIR` shape changes are versioned. Additive changes (new optional fields, new leaf operators added alongside existing ones) are allowed without an ACO; renames or removals require an ACO and a major bump (per I14).
- The rule engine algorithm carries a version tag in `RuleEvaluationResult` so historical evaluations remain reproducible (per I13). Re-running a historical fixture at its original `as_of` with the original engine version yields identical output.
- Discretionary and predictive rules cannot be silently promoted to deterministic; the `truthLevel` and `interpretiveStatus` flow through to the snapshot and the UI (per I8).
- Package authors who need a new operator must propose it via an ACO; they cannot invent private operators (per I11, I16).
- The architecture test suite (section 34) verifies `rule-compilation-integrity`: every published `RuleIR` compiles to a valid `ConditionNode` tree with at least one effect.

## Invariants affected

- **I5** — no LLM as authoritative decision engine; `RuleIR` is the executable representation, not LLM output.
- **I6** — `calculation` trace feeds `ProvenanceBuilder`; every fired rule produces a `Provenance` entry.
- **I7** — temporal/version metadata lives on the parent `Rule` and is honoured by `evaluate(rule, facts, asOf)`.
- **I8** — community-level rules cannot produce authoritative obligations; the rule's `truthLevel` governs.
- **I11** — packages cannot extend `RuleIR` with private operators or shapes.
- **I13** — algorithm versioned for reproducibility.
- **I14** — `RuleIR` contract preserved unless versioned.
- **I16** — no new primitive (e.g., a new leaf operator or effect kind) without an ACO.

## Migration implications

- At adoption there is no prior `RuleIR`. All rules authored henceforth must ship as `RuleIR`.
- The `RuleEngine` interface (`evaluate(rule, facts, asOf) → RuleEvaluationResult`, plus `evaluateAll(rules, facts, asOf)`) is the contract surface; see `src/kernel/rules/RuleEngine.ts` and `src/kernel/rules/conditionEval.ts` (the pure condition evaluator with no IO).
- The schema in `schemas/rule-ir.schema.md` is the canonical reference; package authors must conform. A JSON example for a customs duty rule is included there.
- The contract document `contracts/rule.md` specifies Purpose, Inputs, Outputs, Errors, Versioning, Security, Provenance, Idempotency, Failure Semantics, and Invariants Enforced for the engine.
- Future revisions to `RuleIR` (v2, v3, …) must supersede this ADR rather than overwrite it; old ADRs are kept, never deleted (section 36).
- A future v2 that introduces breaking changes (e.g., a new required field, removal of an operator) must declare a compatibility strategy, migration strategy, rollback strategy, affected packages, affected APIs, and testing requirements per the ACO process (section 46).

## References

- `schemas/rule-ir.schema.md` — canonical schema and a JSON example.
- `contracts/rule.md` — `RuleEngine` contract (Purpose, Inputs, Outputs, Errors, Versioning, Security, Provenance, Idempotency, Failure Semantics, Invariants Enforced).
- `decisions/0003-truth-model.md` — the T0–T5 model that flows through `RuleIR` to `RuleEffect` to `FiredEffect`.
- `fixtures/border-crossing-golden-01.json` — a golden fixture exercising `RuleIR` evaluation including an exception clause.
- Source specification sections 11 (RuleIR), 12 (rule types), 14 (provenance), 15 (temporal model).
