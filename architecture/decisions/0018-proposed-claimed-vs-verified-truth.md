# ADR 0018 (PROPOSED) — Claimed vs Verified Truth Levels

**Status:** PROPOSED (architecture backlog — not yet implemented)
**Date:** 2026-08-19
**Decider:** —
**Supersedes:** none
**Superseded by:** —
**References:** ADR 0003 (truth model T0–T5), contracts/fact.md, architecture/invariants.md I8

## Context

The fact ingestion contract (ADR 0017) states:

> API-supplied facts are untrusted input. The server normalizes every submitted fact's `tenantId` to the authenticated session's `tenantId`. [...] The fact's `truthLevel` is preserved — the caller may assert a fact at any truth level.

This means an authenticated user can submit a fact with `truthLevel: T0` (Authoritative / official source) and the engine will accept it as a T0 input. The kernel defines T0 as:

> T0 — authoritative: enacted text, official source.

There is a semantic tension. The user is allowed to **claim** T0, but the platform hasn't necessarily **verified** that the fact actually comes from an authoritative source. The provenance system records who submitted the fact and when, but it doesn't currently distinguish between:

- A fact extracted from an official government document (genuinely T0)
- A fact a user typed into a form and labelled T0 (claimed T0)

For the long-term legal/reality engine — especially when the platform handles insurance claims, border crossings, and regulatory compliance — this distinction matters. An "authoritative" fact that was simply supplied by a user could undermine the provenance system's integrity.

## Decision (PROPOSED — not yet implemented)

Introduce a `verificationStatus` field on facts that distinguishes claimed from verified truth:

```typescript
interface Fact {
  // ... existing fields ...
  truthLevel: TruthLevel;          // the claimed or verified truth level
  truthLevelSource: 'USER_CLAIM' | 'DOCUMENT_EXTRACTION' | 'AUTHORITY_PUBLICATION' | 'ENGINE_DERIVATION';
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED';
}
```

Semantics:
- `truthLevel`: the level the fact claims to be (preserved as today)
- `truthLevelSource`: how the truth level was assigned
  - `USER_CLAIM`: a user typed it in (the current default for API-submitted facts)
  - `DOCUMENT_EXTRACTION`: extracted from a document via the evidence pipeline (§16)
  - `AUTHORITY_PUBLICATION`: loaded from an official source (e.g. a government API)
  - `ENGINE_DERIVATION`: produced by the rule engine from T0 facts (T1)
- `verificationStatus`:
  - `UNVERIFIED`: the fact's truth level is a claim, not verified
  - `VERIFIED`: the fact has been verified against an authoritative source
  - `DISPUTED`: a conflicting fact exists or a reviewer has flagged it

The engine would then surface the verification status in the StateSnapshot — a decision grounded in unverified T0 claims would carry a different epistemic weight than one grounded in verified T0 facts.

## Alternatives Considered

- **Reject user-submitted T0 facts entirely** (force all API facts to T4/community-observed). Rejected: too rigid — a user with a genuine passport should be able to assert "nationality = GH" at T0, not T4.

- **Separate `claimedTruthLevel` and `verifiedTruthLevel` fields.** Considered — this is essentially the same as the proposed `truthLevel` + `verificationStatus` pair, just named differently. The proposed naming is cleaner because `truthLevel` remains the single field the engine evaluates against, and `verificationStatus` is a separate concern.

- **Do nothing — document the tension and move on.** Acceptable for the current prototype, but the user's audit correctly flagged this as a future integrity issue. Recording it as PROPOSED ensures it's not forgotten.

## Consequences (if implemented)

- The `Fact` primitive gains two new fields. This is a schema change (Prisma + TypeScript types) but not an architectural change — the kernel primitive surface is extended, not redefined.
- The rule engine evaluation is unchanged — it still evaluates against `truthLevel`. The `verificationStatus` is surfaced in the StateSnapshot for the UI and audit trail to display.
- The evidence pipeline (§16) would set `truthLevelSource: DOCUMENT_EXTRACTION` and `verificationStatus: VERIFIED` when it extracts a fact from a document.
- The API would set `truthLevelSource: USER_CLAIM` and `verificationStatus: UNVERIFIED` for all user-submitted facts (unless the user is an authority — a future capability).

## Invariants Affected

- **I8 (community observations cannot masquerade as authority):** strengthened — a user-claimed T0 fact would be explicitly marked `UNVERIFIED`, preventing it from being treated identically to an authority-published T0 fact.

## Migration Implications

- Schema migration: add `truthLevelSource` and `verificationStatus` columns to `FactRecord`.
- Backfill: existing facts default to `truthLevelSource: USER_CLAIM` and `verificationStatus: UNVERIFIED`.
- API: `/api/state` and `/api/context` set these fields on incoming facts.
- UI: the TruthBadge component gains a verification indicator.

## Why This Is PROPOSED, Not ACCEPTED

This is an architecture backlog item, not a current sprint deliverable. It requires:
- Schema design review
- Evidence pipeline integration (the document pipeline doesn't exist yet)
- UI changes to surface verification status
- A review of whether `truthLevelSource` should be an enum or a more flexible reference (e.g. to a Source record)

It should be accepted only when the platform is ready to ingest documents and authority publications, not before. Recording it now ensures the design is documented and the tension is acknowledged.

## References

- ADR 0003 — Truth model (T0–T5)
- ADR 0017 — Fact ingestion contract
- `architecture/contracts/fact.md` — Fact primitive contract
- `architecture/invariants.md` I8 — Community observations cannot masquerade as authority
