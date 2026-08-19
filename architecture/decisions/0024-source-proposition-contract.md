# ADR 0024 — SourceProposition as a Formal Contract + Legal Evidence Model

**Status:** ACCEPTED
**Date:** 2026-08-19
**Decider:** Chief Architect
**Supersedes:** ADR 0023 (subsumes and formalizes its approach)
**Superseded by:** —
**References:** ADR 0018 (PROPOSED — claimed vs verified truth), ADR 0019 (RuleIR validator), ADR 0022 (PROPOSED — ECOWAS temporal membership), I6 (provenance), I8 (community observations cannot masquerade as authority), §11 (RuleIR), §13 (truth model T0–T5), §14 (provenance)

## Context

ADR 0023 introduced the `MACHINE_VALID` vs `LEGALLY_VERIFIED` distinction but stored `SourceProposition` records as JSON strings inside `RuleIR.definitions` — a generic `Record<string, Definition>` where `Definition = { term: string; meaning: string }`. This approach is structurally fragile:

1. **No type safety.** The proposition is a JSON string inside a `meaning` field. The compiler cannot verify its shape.
2. **No runtime access.** To check whether a rule is LEGALLY_VERIFIED, you must `JSON.parse()` a string buried in definitions — the platform cannot inspect a Rule object and answer "is this rule legally verified?" without fragile string parsing.
3. **No versioning.** A corrected legal interpretation cannot create a new version of the proposition — it just replaces the JSON string. Historical reproducibility (I13) is broken at the evidence level.
4. **RULE-016 is heuristic.** The architecture test scans source files with regexes, skipping legacy packages. A real legal certification boundary must inspect actual Rule objects at runtime.

The user's audit correctly identified that the current implementation is "not strong enough for a legal certification boundary."

## Decision

### 1. SourceProposition as a formal kernel type

Add `SourceProposition` as a typed interface in `src/kernel/primitives/types.ts`:

```typescript
export interface SourceProposition {
  sourceId: string;
  legalProvision: string;
  proposition: string;
  jurisdictionId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  evidenceLocation: string;
  verificationStatus: 'MACHINE_VALID' | 'LEGALLY_VERIFIED';
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  version: number;
  supersedes?: string | null;
}
```

Fields:
- `sourceId` — references a `Source.id` in the same or dependency package
- `legalProvision` — the exact article/provision (e.g., "Article 3", "Section 2(1)")
- `proposition` — the exact legal proposition being asserted (plain text, not RuleIR)
- `jurisdictionId` — the jurisdiction under which this proposition has force
- `effectiveFrom` / `effectiveTo` — temporal interval of legal force (I7)
- `evidenceLocation` — where the evidence was found (page number, URL, gazette reference)
- `verificationStatus` — `MACHINE_VALID` or `LEGALLY_VERIFIED`
- `verifiedBy` — identity of the verifier (a human reviewer name, a certification authority ID, or a platform verifier ID)
- `verifiedAt` — ISO timestamp of verification
- `verificationNotes` — reviewer notes (what was checked, what was found)
- `version` — monotonically increasing per proposition (for historical reproducibility, I13)
- `supersedes` — the previous version's ID (if this proposition corrects a prior version)

### 2. Add `sourcePropositions` to RuleIR

Add an optional `sourcePropositions` field to the `RuleIR` interface:

```typescript
export interface RuleIR {
  // ... existing fields ...
  sourcePropositions?: SourceProposition[];
}
```

This is a **backward-compatible extension** — existing rules without `sourcePropositions` continue to work. The field is optional because:
- Legacy packages (jur.ecowas@1.0.0, jur.afcfta@1.0.0) are immutable (I10) and don't have it.
- Non-legal rules (test fixtures, generic rules) don't need it.

### 3. Runtime certification verifier

Create `src/kernel/rules/RuleCertificationVerifier.ts` with:

```typescript
export interface CertificationResult {
  certified: boolean;
  violations: string[];
}

export function verifyRuleCertification(rule: Rule): CertificationResult;
export function verifyPackageCertification(rules: Rule[]): CertificationResult;
```

The verifier inspects the actual `Rule` object (not source files):

- If `rule.truthLevel === 'T0'`:
  - `rule.ruleIr.sourcePropositions` MUST exist and be non-empty
  - At least one proposition MUST have `verificationStatus === 'LEGALLY_VERIFIED'`
  - Every LEGALLY_VERIFIED proposition MUST have non-empty `verifiedBy`, `verifiedAt`, `evidenceLocation`
  - The proposition's `sourceId` MUST match the rule's `sourceId`
  - The proposition's `jurisdictionId` MUST match the rule's `jurisdictionId`
- If `rule.truthLevel !== 'T0'`:
  - No certification requirement (T2 rules may have MACHINE_VALID propositions)
  - But if `sourcePropositions` exist, they must be well-formed

### 4. Certification gate

Create `src/packages/PackageCertificationGate.ts`:

```typescript
export interface PackageCertificationResult {
  certified: boolean;
  machineValid: boolean;
  violations: string[];
}

export function certifyPackage(rules: Rule[]): PackageCertificationResult;
```

A package is `certified` (LEGALLY_VERIFIED) only when:
1. All referenced sources exist (checked by PackageValidator)
2. All source propositions resolve
3. Every T0 rule has at least one LEGALLY_VERIFIED proposition
4. Effective dates are valid
5. Authority/jurisdiction references resolve
6. Evidence locations are non-empty
7. Verification identity exists (verifiedBy is non-empty)
8. All propositions have version metadata

A package is `machineValid` when:
1. All rules pass `validateRule()`
2. No T0 rule lacks a LEGALLY_VERIFIED proposition (i.e., T0 rules without verification are downgraded or rejected)

### 5. Architecture tests

RULE-016 is replaced by a **runtime test** that:
- Loads actual packages via `createPackageRegistry()`
- For each rule with `truthLevel === 'T0'`:
  - Checks `rule.ruleIr.sourcePropositions` exists and is non-empty
  - Checks at least one has `verificationStatus === 'LEGALLY_VERIFIED'`
- Legacy packages (without `sourcePropositions`) are grandfathered: their rules are NOT checked (I10 — they were published before ADR-0024)

### 6. What this does NOT change

- **RuleEngine evaluation is unchanged.** The engine evaluates conditions/exceptions/effects. Certification status is orthogonal to evaluation.
- **RuleIR semantics are unchanged.** `sourcePropositions` is an optional metadata field, not a condition or effect.
- **Legacy packages are not modified.** jur.ecowas@1.0.0, jur.afcfta@1.0.0, etc. continue to work without sourcePropositions.
- **The `definitions` field is still available** for other uses. `sourcePropositions` is the dedicated field for legal evidence.

## Alternatives Considered

- **Keep SourceProposition in definitions as JSON.** Rejected — no type safety, no runtime access, no versioning.
- **Add a new top-level Rule field (not RuleIR).** Rejected — the proposition is part of the rule's legal basis, which belongs in RuleIR.
- **Make SourceProposition a separate evidence graph object (ADR-0018 approach).** Considered — but the full evidence graph is future work. The smallest architecture puts the proposition on RuleIR.
- **Add a new TruthLevel (T_MACHINE).** Rejected — conflates epistemic level with verification status. MACHINE_VALID rules are T2, not a new T-level.

## Consequences

- `RuleIR` gains an optional `sourcePropositions` field — backward-compatible.
- `SourceProposition` is a formal typed interface — the compiler verifies its shape.
- A runtime `verifyRuleCertification()` function can inspect any Rule object and determine if it's legally verified.
- RULE-016 becomes a runtime test, not a regex scan.
- The Ghana→Togo package's `SourceProposition` records move from JSON strings in `definitions` to typed `sourcePropositions` arrays.
- Historical reproducibility is preserved: propositions carry `version` and `supersedes` fields.

## Invariants Affected

- I6 (provenance) — strengthened: provenance now can reference the exact proposition version.
- I8 (community observations cannot masquerade as authority) — strengthened: T0 rules require LEGALLY_VERIFIED propositions at runtime.
- I13 (historical decisions remain reproducible) — strengthened: propositions are versioned.
- I10 (packages immutable after publication) — respected: legacy packages without sourcePropositions are grandfathered.

## Migration Implications

- The Ghana→Togo package (v1.1.0) is updated to v1.2.0 with typed `sourcePropositions`.
- The old JSON-in-definitions approach is removed from the package.
- Legacy packages (jur.ecowas, jur.afcfta, etc.) are NOT modified.
- The `RuleIRValidator` is extended to validate `sourcePropositions` if present (optional field).
