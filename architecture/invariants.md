# Nomos — Architecture Invariants (I1–I18)

> Source: section 31 of the source specification.
> Status: FROZEN. These invariants are the binding constraints of the platform.

Each invariant is presented verbatim, with: a statement of why it matters, what violates it, a correct-vs-incorrect code example, and the test that would catch the violation. Tests live in the architecture test suite (section 34) and run in CI on every meaningful change.

The TypeScript snippets below are illustrative. The authoritative primitive surface is `src/kernel/primitives/types.ts`; the engine contract surface is `src/kernel/contracts/contracts.ts`.

---

## I1. Core remains domain-agnostic.

**Why it matters.** The kernel is the only thing every jurisdiction, vertical, and situation shares. If it absorbs any one vertical's concepts, it begins to encode that vertical everywhere and loses portability across countries and domains (the primary measure of success per section 47).

**What violates it.** Any kernel module that imports a vertical-specific module, mentions a vertical term in code, or special-cases behavior on a vertical predicate. Examples: `InsuranceClaim`, `ADU`, `HospitalAssistance`, `TrafficStop`, `AfCFTAShipment` types in the kernel; `if (insurance) ...`, `if (border) ...`, `if (zoning) ...`, `if (healthcare) ...` branches in core domain logic.

**Correct.**

```ts
// kernel — generic, reusable
export interface Fact {
  id: string; subjectId: string; attribute: string;
  value: unknown; truthLevel: TruthLevel;
}
```

**Incorrect.**

```ts
// kernel — DO NOT do this
export interface InsuranceClaim { claimId: string; adu: ADU; }
if (rule.domain === 'insurance') { ... }
```

**Test.** Architecture test `core-imports-no-vertical-modules`: scans kernel imports and source for forbidden tokens (`InsuranceClaim`, `ADU`, `HospitalAssistance`, `TrafficStop`, `AfCFTAShipment`) and forbidden predicates (`if (insurance)`, `if (border)`, `if (zoning)`, `if (healthcare)`).

---

## I2. Country-specific logic lives in packages.

**Why it matters.** A country is a jurisdiction dimension, not the primary application boundary (section 5). Hard-coding a country collapses portability: adding a new country should never require touching the kernel.

**What violates it.** Kernel code branching on `country === 'GH'` or storing country names as enum keys in primitive types; package-agnostic code that calls country-specific helpers.

**Correct.**

```ts
// package: jurisdiction-ghana
export const ghanaJurisdiction: Jurisdiction = { id: 'jur:gh', code: 'GH', name: 'Ghana', kind: 'COUNTRY', parentIds: ['jur:ecowas'], temporal: { ... } };
```

**Incorrect.**

```ts
// kernel
function applicableRules(country: string) {
  if (country === 'GH') return ghanaRules;
}
```

**Test.** Architecture tests `core-imports-no-vertical-modules` and `core-imports-no-domain-implementation` jointly verify no kernel module imports a package or a country-specific module; an additional scan rejects ISO country codes used as kernel identifiers.

---

## I3. Vertical-specific logic lives in packages.

**Why it matters.** Verticals (insurance, customs, healthcare, etc.) must be addable without recompiling the kernel. The kernel is shared; verticals are not.

**What violates it.** Any domain-specific concept (e.g., a tariff rate table, an insurance policyholder) defined as a kernel primitive rather than composed from `Fact`, `Rule`, `RuleIR`, etc.

**Correct.** A customs tariff rule is a `Rule` whose `RuleIR` conditions reference facts such as `goods.hsCode` and whose `effects` carry an `amount` — all generic primitives.

**Incorrect.** Introducing `class TariffRule extends Rule { hsCode: string; rate: number }` in the kernel.

**Test.** Architecture test `domain-packages-cannot-mutate-kernel-contracts` plus a structural scan confirming no kernel type extends with vertical-specific fields.

---

## I4. Situation-specific logic lives in situation/procedure packages.

**Why it matters.** Situations (border crossing, traffic stop, hospital admission, etc.) must be addable without modifying the kernel. The kernel provides the state-machine primitive; situations encode their own states, transitions, and exception paths.

**What violates it.** A kernel-level `BorderCrossingProcedure` type, or a kernel-level `if (situation === 'border_crossing')` branch.

**Correct.** A situation pack publishes a `Situation` with `entryConditions`, `states`, `transitions`, `exitConditions`, `exceptionPaths`; the `SituationEngine` operates on the generic shape.

**Incorrect.** Hard-coding the `APPROACH → ORIGIN_EXIT → TRANSITION → DESTINATION_ENTRY → CUSTOMS → COMPLETION` flow inside the kernel.

**Test.** Architecture test confirms kernel modules import no situation packs; kernel symbols do not include situation identifiers (`border_crossing`, `traffic_stop`, …).

---

## I5. LLM output is never authoritative legal truth.

**Why it matters.** LLMs hallucinate. Authoritative answers must come from deterministic, inspectable machinery so they can be audited and reproduced. This is what separates Nomos from "an LLM pretending to be a rules engine."

**What violates it.** Returning LLM-generated text as the answer to a legal question without first routing it through the rule engine; storing LLM output as a `Fact` at `truthLevel: 'T0'` (authoritative) or `T1` (deterministically derived); using an LLM to decide which rule fires.

**Correct.** LLM extracts a `Fact` (T3 expert interpretation) → rule engine fires → decision recorded with `Provenance` → explanation generator summarises for the user.

**Incorrect.**

```ts
const answer = await llm.ask(userQuestion);
return { answer }; // no rule evaluation, no provenance
```

**Test.** Architecture tests `provenance-on-decisions` and a static check that LLM client modules are not imported by rule/decision engines; all decision responses carry a non-null `Provenance[]`.

---

## I6. Every material decision has provenance.

**Why it matters.** A material decision is one that influences a user's rights, obligations, permissions, or restrictions. Without provenance the platform cannot answer "why did we produce this answer?", "when did we know it?", or "which version did we use?" — and cannot be auditable.

**What violates it.** A `DecisionEngine.decide(...)` result with an empty `provenance[]`; storing a `Fact` without a `source`; returning a state snapshot whose `provenance` is `[]`.

**Correct.** Every `StateSnapshot` carries `provenance: Provenance[]`; each entry records `decisionId, ruleId, ruleVersion, source, authority, facts, evidence, calculation, assumptions, truthLevel, asOf, producedAt`.

**Incorrect.** Persisting a snapshot without provenance "to save a column".

**Test.** Architecture test `provenance-on-decisions` rejects any persisted decision snapshot whose `provenance` array is empty or whose entries omit required fields.

---

## I7. Every rule has temporal/version metadata.

**Why it matters.** Without temporal metadata the platform cannot support `evaluate(as_of = DATE)`. Historical truth must remain reconstructable; law is not retroactive.

**What violates it.** A `Rule` with `temporal.validFrom` missing; storing rules without `version`; mutating a published rule in place rather than versioning it.

**Correct.** Every `Rule` carries `temporal: TemporalRange` (`validFrom`, `validTo?`, `publishedAt?`, `ingestedAt?`, `version`, `supersedes?`, `supersededBy?`).

**Incorrect.** `UPDATE rules SET body = ? WHERE id = ?` with no new row, no `version` bump, no `supersedes` link.

**Test.** Architecture test `temporal-reproducibility` (a) rejects rules with missing `validFrom`/`version`, (b) replays a historical fixture at its original `as_of` and asserts identical output.

---

## I8. Community observations cannot masquerade as authority.

**Why it matters.** Reports from the field (T4) carry different certainty than enacted law (T0). Collapsing the two would let rumor drive legal conclusions.

**What violates it.** Storing a community report as a `Fact` with `truthLevel: 'T0'`; surfacing a `COMMUNITY-REPORTED` observation as an authoritative requirement in the UI; treating an `Observation` as a `Rule`.

**Correct.** Community observations live in the observational layer with `status: 'COMMUNITY_REPORTED'` and influence the user only as advisory context; they are never the basis of an authoritative obligation.

**Incorrect.** Promoting a community-reported fee into `Obligation.amount` without a corresponding authoritative rule.

**Test.** Architecture test that no `Rule` carries `truthLevel: 'T4'` or `'T5'`; no `Fact` with `truthLevel: 'T4'` or `'T5'` is referenced by a `Rule` at `truthLevel: 'T0'`/`'T1'` as if it were authoritative.

---

## I9. Private tenant data cannot enter global knowledge without explicit, authorized publication.

**Why it matters.** Tenant isolation is a security boundary. A leak through "global retrieval" or training data would breach confidentiality and break trust.

**What violates it.** Querying the global knowledge graph from a tenant context without a tenant filter; indexing tenant facts into a global search index; sending tenant documents to an LLM training pipeline.

**Correct.** Every query carries a `tenantId`; reads from global knowledge are explicitly scoped; promotion of tenant data to global is an explicit, audited `PUBLISH` action.

**Incorrect.** `SELECT * FROM facts WHERE attribute = 'tax_id'` with no `tenantId` filter.

**Test.** Architecture test `tenant-data-isolation` issues queries from a tenant context and asserts no other tenant's facts are returned; integration test confirms global retrieval does not include tenant-private facts.

---

## I10. Packages are independently versioned and deployable.

**Why it matters.** A jurisdiction pack should be shippable without coordinating a kernel release; a domain pack should be addable without redeploying customs. Independence is what makes composition possible.

**What violates it.** Two packages sharing a single `version` field managed by the kernel; package deployment coupled to kernel release trains; cross-package in-place schema mutations.

**Correct.** Each `PackageManifest` carries its own `version` and `verificationMetadata`; deployments are package-scoped; rollback is per-package.

**Incorrect.** A monolithic deploy bundle that ships kernel + every package together with a single version.

**Test.** Architecture test `package-dependency-rules` validates that each manifest declares its own `version` and that dependency `versionRange`s resolve against published manifests; rollback test confirms a single package can be rolled back without affecting others.

---

## I11. Packages cannot silently mutate kernel semantics.

**Why it matters.** A package that redefines `Rule`, `Fact`, or `Jurisdiction` effectively forks the platform. The kernel must remain the single source of truth for primitives.

**What violates it.** A package shadowing `Fact` with `Fact2`; a package monkey-patching the rule evaluator; a package introducing a new primitive "just for this vertical".

**Correct.** Packages compose primitives (`Rule`, `Fact`, `Situation`, etc.); they do not redefine them.

**Incorrect.** A domain pack shipping `export interface Fact { ... }` that conflicts with the kernel's `Fact`.

**Test.** Architecture test `domain-packages-cannot-mutate-kernel-contracts` rejects any package whose exported primitive shape diverges from the kernel's.

---

## I12. Extensions cannot bypass capability permissions.

**Why it matters.** Extensions run with the privileges they declare, no more. Without enforced capabilities a plugin could read any tenant's data or invoke any action.

**What violates it.** A plugin reading tenant data without a `READ` capability; an extension invoking a privileged connector without `INVOKE`; an action dispatched without `ACT_UPON`.

**Correct.** Every extension declares exactly what it can: `READ`, `WRITE`, `INVOKE`, `ACT_UPON`. The runtime checks each call against declared capabilities.

**Incorrect.** A plugin calling `db.query('SELECT * FROM facts')` with no declared `READ` capability.

**Test.** Architecture test `extensions-respect-capability-boundaries` runs each extension against a deny-by-default runtime and asserts no privileged call succeeds without the matching capability.

---

## I13. Historical decisions remain reproducible.

**Why it matters.** A decision made last year must be reconstructable today using the rule versions, facts, and package versions that existed then. Without reproducibility, auditability is illusory.

**What violates it.** Editing a published rule in place (see I7); deleting superseded sources; rewriting historical fixtures whenever output changes.

**Correct.** A golden fixture is committed alongside the rule versions that produced it; rerunning the suite at the original `as_of` yields identical output. Updates that change a fixture's expected output are flagged explicitly (section 21).

**Incorrect.** Re-running last year's decision with this year's rule versions and silently accepting different output.

**Test.** Architecture tests `historical-fixture-stability` and `temporal-reproducibility` replay committed fixtures and assert identical results; CI fails on any unflagged fixture diff.

---

## I14. Production changes must preserve backward-compatible contracts unless explicitly versioned.

**Why it matters.** Downstream packages, connectors, and tenants depend on stable contracts. Breaking changes must be deliberate, versioned, and announced — never accidental.

**What violates it.** Renaming or removing a public field on `StateSnapshot` without bumping a contract version; changing `Rule.evaluate` to return a different shape; altering endpoint payloads in a patch release.

**Correct.** Additive changes (new optional fields, new endpoints) are allowed; removals or renames require a new major version and a documented migration.

**Incorrect.** `state: StateSnapshot` quietly becomes `state: StateSnapshotV2` with renamed fields and no migration note.

**Test.** Architecture test `api-backwards-compatibility` runs the previous released contract test suite against the new build and rejects any regression that is not gated by an explicit version bump.

---

## I15. Architecture is changed only through an Architecture Change Order.

**Why it matters.** The architecture is the source of truth. Without a single, explicit change mechanism, drift accumulates silently.

**What violates it.** Modifying `architecture/constitution.md`, `architecture/invariants.md`, or any contract document without an ACO; altering the kernel in ways that change observable behavior and bypassing the ACO process.

**Correct.** Any architectural change begins with an ACO that states the change requested, reason, current limitation, invariant affected, alternatives considered, new architecture, compatibility strategy, migration strategy, rollback strategy, affected packages, affected APIs, and testing requirements.

**Incorrect.** "Just this once" branching in the kernel because the feature is urgent.

**Test.** CI step `architecture-docs-unchanged-since-aco` checks that any diff to `architecture/` is accompanied by a referenced ACO number; otherwise the build fails.

---

## I16. No feature may introduce a new architectural primitive merely because it makes one feature easier.

**Why it matters.** Each new primitive widens the surface that every jurisdiction, vertical, and situation must support. The cost compounds.

**What violates it.** Adding `Tariff` or `InsurancePolicy` to the kernel "because it's cleaner"; adding `TrafficStop` because "we need it for the border use case".

**Correct.** Compose the new behavior from existing primitives inside a package; only promote to the kernel when at least two independent verticals need it (I17).

**Incorrect.** Adding a primitive to make one feature easier.

**Test.** Architecture test `no-new-kernel-primitives-without-aco` rejects any new public type in `src/kernel/primitives/types.ts` not covered by an ACO.

---

## I17. Repeated code across verticals is evidence to improve the kernel or create a shared capability, not evidence to duplicate vertical logic.

**Why it matters.** Duplication hides bugs and drifts. If three verticals need the same primitive, the kernel or a shared capability package should provide it once.

**What violates it.** Copy-pasting the same helper into every vertical package; reimplementing currency formatting in each domain pack.

**Correct.** Promote shared logic to a capability package (e.g., `currency-formatting-capability`) and have vertical packages depend on it.

**Incorrect.** Adding `formatCedis()`, `formatNaira()`, `formatShilling()` as parallel copies across verticals.

**Test.** Architecture test `no-duplicate-vertical-logic` flags large syntactic overlaps between packages and suggests promotion; CI surfaces the report for human review.

---

## I18. A hardening sprint may improve implementation but may not redefine architecture.

**Why it matters.** Hardening sprints exist to harden, not to redirect. Conflating the two lets drift accumulate under the cover of "improvements".

**What violates it.** Refactoring the rule engine into something that no longer matches `RuleEngine.evaluate(rule, facts, asOf)`; renaming public contracts during a sprint; introducing new primitives "while we're in there".

**Correct.** A hardening sprint may add tests, fix bugs, improve performance, and refactor internals — provided public contracts, invariants, and the architecture documents remain unchanged.

**Incorrect.** Using a hardening sprint to ship a new primitive without an ACO.

**Test.** CI step `architecture-diff-gate` fails the build when a sprint's diff touches `architecture/` or primitive types without an accompanying ACO; the test passes when only implementation files change.

---

## Cross-reference

- The full set of invariants is mirrored verbatim in `constitution.md` (section "The 18 Architecture Invariants") and summarized in `README.md`.
- The architecture test suite (section 34) operationalises each invariant — see the test names cited above.
- ADRs in `decisions/` record the decisions that established each invariant.
- Contracts in `contracts/` carry the "Invariants Enforced" section that ties each subsystem to the invariants it must uphold.
