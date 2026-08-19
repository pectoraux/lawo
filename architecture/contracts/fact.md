# Contract — Fact (Typed Observation Primitive)

> Family: Foundation.
> Implementation surface: `src/kernel/primitives/types.ts` (`Fact`, `TruthLevel`, `SourceRef`); consumed by `ContextBuilder`, `RuleEngine` (via `ConditionNode.leaf.fact`), `StateEngine`, `DecisionEngine`, `ProvenanceBuilder`, and the Evidence pipeline (`EvidenceGraph`).
> Status: FROZEN. Changes require an ACO.

## Purpose

A `Fact` is a typed observation about a subject (an `Entity`) at a point in time (section 3, section 4). Facts are the **REALITY** input to the platform's core abstraction:

```
REALITY → FACTS → APPLICABLE RULES → STATE → OPTIONS → ACTION → EVIDENCE → VERIFIED OUTCOME
```

A `Fact` carries its `truthLevel` end-to-end — storage → retrieval → reasoning → UI → API → audit (per I8, per ADR 0003). Document-extracted facts MUST retain provenance to the source page/region (section 16, per `contracts/evidence.md`). The rule engine evaluates facts deterministically; LLMs may extract facts but never produce authoritative ones (per I5).

## Inputs

The `Fact` shape (authoritative: `src/kernel/primitives/types.ts`):

- `id: string` — stable, unique fact id
- `subjectId: string` — the `Entity.id` this fact is about
- `attribute: string` — the attribute name (e.g., `"goodsValueUsd"`, `"nationality"`, `"hasProhibitedGoods"`)
- `value: unknown` — the observed value (typed by consumer contract)
- `truthLevel: TruthLevel` — `T0`…`T5` (per ADR 0003); community observations carry `T4`, predictions `T5`
- `source?: SourceRef` — link to the authoritative source; REQUIRED for `T0`/`T1` facts
- `observedAt: string` — ISO date when the fact was observed
- `tenantId: string | null` — `null` means `GLOBAL` knowledge (per I9)
- `jurisdictionId?: string` — the jurisdiction in which the observation holds (optional)

A `Fact` is consumed by:

- `ContextRequest.facts: Fact[]` — the caller-supplied fact bundle that drives `ContextBuilder`
- `RuleEngine.evaluate(rule, facts, asOf)` — the rule engine evaluates `ConditionNode` trees over fact attributes
- `Evidence.extractedFactIds` — document-extracted facts are linked back to the source page/region (per `contracts/evidence.md`)
- `Provenance.facts: FactRef[]` — every material decision records the facts it used

## Outputs

`Fact` is a primitive, not an engine — it does not produce computational outputs. It participates in:

- `ContextBundle.request.facts` — facts carried forward into evaluation
- `RuleEvaluationResult.calculation` — fact values are recorded as `CalculationStep.input` so the engine's reasoning is inspectable (per I6)
- `StateSnapshot.provenance[].facts: FactRef[]` — every provenance entry records the facts used by its rule
- `AuditEvent.payload` — fact ids appear in audit events when material actions depend on them

## Errors

`Fact` itself is a data primitive; errors are raised by consumers:

- `UnknownFactError` — rule references a fact attribute that is absent in the supplied facts
- `FactTypeError` — fact value is of the wrong type for the operator (`gt` on a string, etc.); the engine does not coerce
- `TenantBoundaryError` — caller attempted to read a fact whose `tenantId` is outside its scope without an explicit publish (per I9)
- `TruthLevelViolationError` — a `T0`/`T1` fact is missing its required `source`, or an LLM-extracted fact is stored above `T3` (per I5, I8)
- `MalformedFactError` — required field missing (`id`, `subjectId`, `attribute`, `value`, `truthLevel`, `observedAt`, `tenantId`)

Errors are structured (`{ code, message, context }`) and never raise silent exceptions.

## Versioning

- The `Fact` shape is versioned. Additive changes (new optional fields) are allowed. Renames or removals require a new major version and an ACO.
- The `TruthLevel` enum (T0–T5) is fixed by ADR 0003; new levels require an ACO (per I16).
- The set of valid `attribute` names is open; packages introduce new attributes freely without changing the kernel contract.

## Security

- Every `Fact` carries a `tenantId` (`string | null`); cross-tenant reads are refused without an explicit publish (per I9). Private tenant data cannot enter global knowledge without explicit, authorized publication.
- LLM-extracted facts are capped at `T3` (expert interpretation) and MUST NOT be stored at `T0`/`T1` (per I5, per ADR 0003).
- A `T0`/`T1` fact without a `source` is rejected — authoritative facts must be traceable to a `SourceRef`.
- Document-extracted facts MUST retain provenance to the source page/region (per `contracts/evidence.md`, section 16).
- No fact value containing secrets (PII, credentials) may appear in `AuditEvent.payload` without redaction (per section 25, per `contracts/audit.md`).

## Provenance

Facts are the substrate of provenance. Every `Provenance.facts: FactRef[]` entry records `factId`, `subjectId`, `attribute`, `value`, `truthLevel`. This is what enables the platform to answer "what did we know? when did we know it? which version did we use? why did we produce this answer?" (section 14, per I6).

The `source` on a `Fact` and the `source` on a `Rule` together form the citation chain that supports provenance reconstruction. Document-extracted facts additionally carry the page/region link in `Evidence`.

## Idempotency

- Reading a `Fact` by `id` is a pure function: identical inputs yield identical outputs.
- A `Fact` is immutable once persisted; corrections are stored as a new `Fact` with a new `id` (or via the temporal versioning pattern at the storage layer). Historical decisions reference the original `factId` and remain reconstructable (per I13).
- Rule evaluation over a `Fact[]` is a pure function of `(rule, facts, asOf)` — same inputs always yield identical `RuleEvaluationResult` (per I5).

## Failure Semantics

- A fact of the wrong type for the operator raises `FactTypeError`; the engine does not coerce silently.
- A fact with a `T0`/`T1` truth level and no `source` is rejected at validation; the engine does not fabricate a source.
- A fact referencing an unknown `subjectId` surfaces `UnknownEntityError`; the engine does not fabricate an entity.
- A fact referencing an unknown `jurisdictionId` surfaces `InvalidContextError`; the engine does not silently drop the jurisdiction.
- An LLM-extracted fact stored at `T0`/`T1` is rejected at validation; the engine does not silently promote (per I8).

## Invariants Enforced

- **I1** — `Fact` is domain-agnostic; `attribute` is an open string but vertical blacklist is enforced on consumers.
- **I5** — LLM-extracted facts capped at `T3`; facts never influence authoritative decisions without a deterministic rule firing.
- **I6** — facts are the foundation of provenance; every material decision records the facts it used.
- **I7** — `observedAt` and the parent rule's `temporal` range together support `evaluate(as_of = DATE)`.
- **I8** — community observations (`T4`) cannot masquerade as authority (`T0`/`T1`); truth level is preserved end-to-end.
- **I9** — `tenantId` enforced on every read; cross-tenant reads require explicit publish.
- **I13** — facts are immutable once persisted; historical decisions reference the original `factId`.
- **I14** — `Fact` contract preserved across releases unless versioned.
- **I16** — no new primitive in place of `Fact` for a feature; compose with `Fact[]` instead.

## References

- `constitution.md` — section 3 (kernel primitives), section 4 (state as first-class concept), section 13 (truth model), section 14 (provenance), section 16 (evidence graph), section 17 (observational layer).
- `contracts/entity.md` — `Fact.subjectId` references `Entity.id`.
- `contracts/rule.md` — `RuleEngine` evaluates facts via `ConditionNode` trees.
- `contracts/rule-ir.md` — `ConditionNode.leaf.fact` names a `Fact.attribute`.
- `contracts/context.md` — `ContextRequest.facts: Fact[]` is the caller-supplied fact bundle.
- `contracts/state.md` — facts flow through to `StateSnapshot.provenance[].facts`.
- `contracts/evidence.md` — document-extracted facts carry page/region provenance.
- `contracts/audit.md` — fact ids appear in audit event payloads for material actions.
- `contracts/tenant.md` — tenant isolation rules applied to `Fact.tenantId`.
- `decisions/0002-ruleir-v1.md` — `RuleIR` evaluates `Fact.attribute` via leaf operators.
- `decisions/0003-truth-model.md` — the T0–T5 truth hierarchy preserved on `Fact.truthLevel`.
- `src/kernel/primitives/types.ts` — authoritative `Fact` surface.
