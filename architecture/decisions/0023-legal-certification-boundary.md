# ADR 0023 — Legal Certification Boundary: MACHINE_VALID vs LEGALLY_VERIFIED

**Status:** ACCEPTED
**Date:** 2026-08-19
**Decider:** Principal Architect
**Supersedes:** none
**Superseded by:** —
**References:** ADR 0018 (PROPOSED — claimed vs verified truth), ADR 0019 (ruleir validator), I5 (LLM non-authoritative), I6 (provenance), §13 (truth model T0–T5)

## Context

ADR 0018 (PROPOSED) identified the tension between user-claimed T0 facts and genuinely authoritative T0 facts. A broader version of this problem exists at the rule level: a Rule can claim `truthLevel: T0` (Authoritative) merely because its RuleIR is well-formed and its package validator passes.

This creates a semantic gap: the architecture's T0 level means "enacted text, official source" (§13), but the machine has no way to verify that a rule's legal proposition actually corresponds to an enacted text. A rule author can write:

```json
{
  "truthLevel": "T0",
  "interpretiveStatus": "SETTLED",
  "ruleIr": { ... }
}
```

and the system accepts it as authoritative — even if the cited source doesn't actually contain the claimed proposition, or the source is secondary, or the legal interpretation is contested.

The platform needs the smallest primitive necessary to distinguish:

- **MACHINE_VALID** — the RuleIR passes structural validation; the rule is syntactically well-formed and deterministic. This is the minimum for execution.
- **LEGALLY_VERIFIED** — the rule's legal proposition has been independently verified against an authoritative source by a qualified reviewer.

## Decision

Introduce a `verificationStatus` field on the `SourceProposition` record, stored in the RuleIR's `definitions` field. This avoids changing the frozen `Rule` or `RuleIR` interfaces — the verification status is a data-level extension, not a new kernel primitive.

### SourceProposition Record

Each rule that claims a legal basis must include a `sourceProposition` in its `RuleIR.definitions`:

```typescript
interface SourceProposition {
  source: string;                    // sourceId
  article: string;                   // article/provision reference
  proposition: string;               // exact legal proposition
  jurisdiction: string;              // jurisdictionId
  effectiveDate: string;             // ISO date
  evidenceLocation: string;          // where the evidence was found (page, URL, gazette)
  verificationStatus: 'MACHINE_VALID' | 'LEGALLY_VERIFIED';
  verifiedBy?: string;              // reviewer identity (if LEGALLY_VERIFIED)
  verifiedAt?: string;              // ISO timestamp (if LEGALLY_VERIFIED)
}
```

Stored as: `ruleIr.definitions.sourceProposition = { term: 'sourceProposition', meaning: JSON.stringify(proposition) }`

### Truth Level Binding

A rule may claim `truthLevel: T0` (Authoritative) **only** when its SourceProposition's `verificationStatus === 'LEGALLY_VERIFIED'`.

If `verificationStatus === 'MACHINE_VALID'`:
- `truthLevel` MUST be `T2` (Established Interpretation) or lower — NOT T0.
- `interpretiveStatus` SHOULD be `'CONTESTED'` (the legal basis requires verification).

If `verificationStatus === 'LEGALLY_VERIFIED'`:
- `truthLevel` MAY be `T0` (if the source is an enacted text or official publication).
- `interpretiveStatus` MAY be `'SETTLED'`.

### Architecture Test

RULE-016 (new): A rule with `truthLevel: T0` MUST have a `sourceProposition` in its definitions with `verificationStatus: 'LEGALLY_VERIFIED'`. This is a static architecture test that scans package data.

### What This Does NOT Do

- Does NOT change the frozen `Rule` or `RuleIR` interfaces (the verification status is in `definitions`, which is already an optional field).
- Does NOT implement the full ADR-0018 observation system (truthLevelSource, verificationStatus on facts).
- Does NOT add confidence scoring.
- Does NOT require an LLM for verification — LEGALLY_VERIFIED requires a human reviewer.

## Alternatives Considered

- **Add `verificationStatus` directly to the `Rule` interface.** Rejected — this changes the frozen kernel primitive surface. The `definitions` field already exists for arbitrary key-value metadata; using it avoids a schema change.

- **Add a new `TruthLevel` value (e.g., T_MACHINE).** Rejected — this conflates epistemic level with verification status. A machine-validated rule can still be T2 (established interpretation) — the issue is that it cannot legitimately claim T0.

- **Do nothing — document the tension.** Rejected — the user's audit correctly identified that unverified rules claiming T0 undermines the provenance system's integrity.

## Consequences

- Rules without a verified SourceProposition are downgraded from T0 to T2.
- The `interpretiveStatus` for unverified rules is `CONTESTED`.
- The Ghana→Togo border package (v1.1.0) downgrades all three rules to T2 until legal verification is completed.
- A new architecture test (RULE-016) enforces that T0 rules must have LEGALLY_VERIFIED propositions.
- The full ADR-0018 observation system (fact-level verification) remains PROPOSED for future work.

## Invariants Affected

- I8 (community observations cannot masquerade as authority) — strengthened: now applies to rules, not just facts.
- I6 (provenance) — strengthened: provenance carries the truth level, which is now constrained by verification status.

## Migration Implications

- Existing rules claiming T0 without a verified SourceProposition should be downgraded to T2.
- The Ghana→Togo border package v1.1.0 implements this: all three rules are T2 with `interpretiveStatus: 'CONTESTED'` and `verificationStatus: 'MACHINE_VALID'`.
- The ECOWAS rules in `jur.ecowas@1.0.0` are NOT modified (I10 — packages are immutable after publication). A future `jur.ecowas@1.1.0` will carry SourcePropositions.

## References

- ADR 0018 (PROPOSED) — claimed vs verified truth (fact-level)
- ADR 0019 — RuleIR validator
- `architecture/contracts/rule-ir.md` — RuleIR contract
- `architecture/invariants.md` I8 — community observations cannot masquerade as authority
