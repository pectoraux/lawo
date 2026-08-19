# Contract — RuleIR (Canonical Machine-Readable Rule Representation)

> Family: Foundation.
> Implementation surfaces: `src/kernel/primitives/types.ts` (`RuleIR`, `ConditionNode`, `RuleEffect`, `EffectKind`, `Definition`); evaluated by `src/kernel/rules/RuleEngine.ts` and `src/kernel/rules/conditionEval.ts`; schema documented in `architecture/schemas/rule-ir.schema.md`.
> Status: FROZEN. Changes require an ACO.

## Purpose

`RuleIR` is the canonical machine-readable representation of a rule (section 11). It is the boundary between "authoritative legal text" and "executable rule evaluation". Authoritative legal text remains the source of truth; `RuleIR` is generated from that source and linked back to it via `references`. **Free-form prose is NEVER the executable representation** (section 11).

`RuleIR` is consumed by the `RuleEngine` (see `contracts/rule.md`), which evaluates it deterministically — no LLM in the loop (per I5). The compiled runtime representation is generated from `RuleIR`; rule authoring workflows MAY be LLM-assisted for extraction but never LLM-authoritative (per I5, per ADR 0002).

`RuleIR` is a first-class architectural concept (section 11) — it is the data primitive that every rule in every package must conform to. This contract documents `RuleIR` itself; `contracts/rule.md` documents the engine that evaluates it.

## Inputs

### `RuleIR` shape (authoritative: `src/kernel/primitives/types.ts`)

- `id: string` — stable id of this `RuleIR` instance
- `ruleId: string` — the parent `Rule` this `RuleIR` belongs to
- `conditions: ConditionNode` — a boolean expression tree over facts (see below); the rule fires iff `conditions` evaluates true AND no `exceptions[i]` evaluates true
- `exceptions: ConditionNode[]` — if any element evaluates true, the rule does not apply (empty array allowed)
- `effects: RuleEffect[]` — rights / obligations / permissions / restrictions / fees / options / consequences granted or denied (see below)
- `definitions?: Record<string, Definition>` — optional term-to-meaning map; `Definition = { term, meaning }`
- `references?: string[]` — `sourceId` references to the underlying authoritative text
- `interpretiveStatus?: 'SETTLED' | 'CONTESTED' | 'AMBIGUOUS'` — epistemic status of the rule's interpretation (per section 12)

### `ConditionNode` shape — pure-data boolean expression tree

A `ConditionNode` is one of:

- `{ kind: 'leaf'; fact: string; operator: Operator; value: unknown }` where `Operator ∈ { 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists' }`
- `{ kind: 'and'; children: ConditionNode[] }` — short-circuit conjunction
- `{ kind: 'or'; children: ConditionNode[] }` — short-circuit disjunction
- `{ kind: 'not'; child: ConditionNode }` — negation

A `leaf` references a `Fact.attribute` via `fact`; the engine looks up the supplied fact value for that attribute, applies the `operator` against `value`, and returns a boolean.

### `RuleEffect` shape

- `kind: EffectKind ∈ { RIGHT, OBLIGATION, PERMISSION, RESTRICTION, FEE, OPTION, CONSEQUENCE }`
- `code: string` — short stable code (e.g., `RIGHT_FREE_ENTRY`)
- `label: string` — human-readable label
- `detail?: string` — optional long-form detail
- `amount?: { value: number; currency: string; basis?: string }` — optional monetary amount with basis description (for `FEE` and similar)

## Outputs

`RuleIR` is a data primitive; its "output" is the deterministic `RuleEvaluationResult` produced by the `RuleEngine`:

- `ruleId: string`
- `matched: boolean` — `conditions` evaluated true AND no `exceptions` evaluated true
- `skippedDueToException: boolean` — `conditions` true but an `exceptions[i]` true
- `firedEffects: RuleEffect[]` — the effects that applied (empty if not matched)
- `truthLevel: TruthLevel` — inherited from the parent `Rule`
- `calculation: CalculationStep[]` — auditable intermediate steps (input, output, optional `ruleClause`)

The engine walks `conditions` depth-first, short-circuits on `and`/`or`, evaluates `exceptions`, and — if matched — produces `firedEffects`. The algorithm version is recorded so historical evaluations remain reproducible (per I13).

## Errors

`RuleIR` validation errors are raised at registry load and at evaluation time:

- `MalformedRuleIRError` — `conditions` is not a valid `ConditionNode` tree; unknown `operator`; missing `value` on a leaf that requires one (all operators except `exists`)
- `MalformedConditionNodeError` — `kind` is not one of `leaf` / `and` / `or` / `not`; `and`/`or` missing `children`; `not` missing `child`; `leaf` missing `fact` or `operator`
- `MalformedRuleEffectError` — `kind` not a member of the `EffectKind` enum; `code` or `label` missing; `amount.value` / `amount.currency` missing on an effect that declares `amount`
- `EmptyEffectsError` — `effects` is empty; every rule must produce at least one effect when it fires
- `UnknownFactAttributeError` — a `leaf.fact` references an attribute that is absent in the supplied facts (raised at evaluation time, not at load)
- `OperatorTypeError` — operator applied to a value of the wrong type (`gt` on a string, `in` on a non-array, etc.); the engine does not coerce

Errors are structured (`{ code, message, context }`) and never raise silent exceptions.

## Versioning

- The `RuleIR` shape is versioned. Additive changes (new optional fields, new leaf operators added alongside existing ones) are allowed without an ACO. Renames or removals require an ACO and a major bump (per I14).
- The set of leaf `Operator` values and the set of `EffectKind` values are part of the contract; new values may be added additively but renames/removals require an ACO (per I16).
- The evaluation algorithm is deterministic and version-tagged in `RuleEvaluationResult` so historical evaluations remain reproducible (per I13).
- Package authors who need a new operator or effect kind MUST propose it via an ACO; they cannot invent private operators (per I11, I16).

## Security

- The rule engine reads only the facts passed to it; `RuleIR` carries no IO surface of its own (per I5).
- `RuleIR` is data — it cannot perform tenant queries, network calls, or side-effectful operations. Effects are declarative descriptions of legal consequences; the engine emits them as data, not as direct actions (per `contracts/action.md`).
- `RuleIR.references` link to `sourceId`s; the rule engine never fabricates sources. A `T0`/`T1` rule without a resolvable `sourceId` is rejected at load (per I6).
- `interpretiveStatus` is preserved end-to-end; contested or ambiguous rules MUST be surfaced to the user as such (per section 12). The engine cannot silently promote an interpretation to enacted text.

## Provenance

`RuleIR` is the spine of rule provenance. Every fired rule produces a `Provenance` entry that records:

- `ruleId`, `ruleVersion` — the parent `Rule`'s identity and version
- `source: SourceRef` — derived from `RuleIR.references` → `Rule.sourceId`
- `authority: AuthorityRef` — derived from the parent `Rule`'s `authorityId`
- `facts: FactRef[]` — the facts the engine used (those whose attributes appear in the fired `ConditionNode` leaves)
- `calculation: CalculationStep[]` — the engine's `calculation` trace
- `truthLevel` — inherited from the parent `Rule`
- `asOf` — the `evaluate(as_of = DATE)` anchor

This is what enables "what did we know? when did we know it? which version did we use? why did we produce this answer?" (section 14, per I6).

## Idempotency

- `RuleEngine.evaluate(rule, facts, asOf)` is a pure function. Same inputs → identical `RuleEvaluationResult`, byte-for-byte. Determinism is a hard contract (per I5, I13).
- A `RuleIR` instance is immutable once published; corrections ship as a new `RuleIR` with a new `id` (or via temporal versioning at the parent `Rule` level). Historical decisions reference the original `ruleId` and `ruleVersion` and remain reconstructable (per I13).
- Loading the same set of `RuleIR` instances into the registry always produces the same evaluation surface (per I13).

## Failure Semantics

- A malformed `RuleIR` fails the entire evaluation with `MalformedRuleIRError`; the engine does not silently skip.
- A `ConditionNode.leaf.fact` that references an absent attribute raises `UnknownFactAttributeError`; the engine does not fabricate a default value.
- An operator applied to a value of the wrong type raises `OperatorTypeError`; the engine does not coerce.
- A rule whose `temporal` range does not cover `asOf` is skipped (returned as `matched=false` with a marker); the engine does not raise.
- An `exceptions[i]` that evaluates true causes `skippedDueToException=true` and `matched=false`; the engine returns empty `firedEffects`.
- An empty `effects` array is rejected at load (`EmptyEffectsError`); every rule must produce at least one effect when it fires.
- A `RuleIR` with `truthLevel: 'T4'` or `'T5'` is rejected at load (per I8, per ADR 0003); community observations and predictions cannot be authoritative rules.

## Invariants Enforced

- **I5** — no LLM in the evaluation path; `RuleIR` is data, not LLM output. LLMs may assist rule authoring but the published `RuleIR` is the executable representation.
- **I6** — `calculation` trace feeds `ProvenanceBuilder`; every fired rule produces a `Provenance` entry.
- **I7** — temporal/version metadata lives on the parent `Rule` and is honoured by `evaluate(rule, facts, asOf)`.
- **I8** — community-level rules cannot produce authoritative obligations; the rule's `truthLevel` governs.
- **I11** — packages cannot extend `RuleIR` with private operators, effect kinds, or shapes.
- **I13** — algorithm versioned for reproducibility; historical fixtures replay identically.
- **I14** — `RuleIR` contract preserved across releases unless versioned.
- **I16** — no new leaf operator or effect kind without an ACO.

## References

- `constitution.md` — section 11 (RuleIR), section 12 (rule types), section 14 (provenance), section 15 (temporal model).
- `schemas/rule-ir.schema.md` — canonical schema and a JSON example for a customs duty rule.
- `contracts/rule.md` — `RuleEngine` contract that evaluates `RuleIR`.
- `contracts/decision.md` — `DecisionEngine` orchestrates context → rules → state → provenance → audit.
- `contracts/state.md` — fired `RuleEffect`s flow into `StateSnapshot.firedEffects`.
- `contracts/fact.md` — `ConditionNode.leaf.fact` names a `Fact.attribute`.
- `contracts/audit.md` — `RuleIR` evaluation is auditable.
- `decisions/0002-ruleir-v1.md` — the ADR that established `RuleIR` v1.
- `decisions/0003-truth-model.md` — the T0–T5 model that flows from parent `Rule` through `RuleIR` to `RuleEffect` to `FiredEffect`.
- `fixtures/border-crossing-golden-01.json` — a golden fixture exercising `RuleIR` evaluation including an exception clause.
- `src/kernel/primitives/types.ts` — authoritative `RuleIR` / `ConditionNode` / `RuleEffect` / `EffectKind` surfaces.
- `src/kernel/rules/RuleEngine.ts` — `evaluate(rule, facts, asOf)` and `evaluateAll(rules, facts, asOf)`.
- `src/kernel/rules/conditionEval.ts` — pure `ConditionNode` evaluator (no IO).
