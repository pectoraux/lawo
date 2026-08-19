# ADR 0022 (REVISED) — ECOWAS Member State Correction + Temporal Membership Model

**Status:** PROPOSED (legal-data correction + temporal model — not yet implemented)
**Date:** 2026-08-19 (revised)
**Decider:** —
**Supersedes:** none
**Superseded by:** —
**References:** ADR 0020 (versioned package registry), ADR 0023 (legal certification boundary), I10 (packages immutable), I13 (historical reproducibility), I7 (temporal versioning)

## Context

An independent audit of `jur.ecowas@1.0.0` found data discrepancies in the ECOWAS member state list:

### 1. Guinea — wrong code
The published 1.0.0 package uses `'GU'` for Guinea. The correct ISO 3166-1 alpha-2 code is `'GN'`. `'GU'` is the code for Guam (a U.S. territory).

### 2. Guinea-Bissau — missing
Guinea-Bissau (ISO 3166-1 alpha-2: `'GW'`) is a founding member of ECOWAS but is absent from the 1.0.0 member-state list.

### 3. Mauritania — withdrawal history corrected
**The original ADR-0022 incorrectly stated Mauritania announced withdrawal in 2023.** The correct history is:

- Mauritania was a founding member of ECOWAS (1975).
- Mauritania formally withdrew from ECOWAS in **December 2000** (not 2023).
- ECOWAS's own official history records this withdrawal.
- Therefore, `jur.ecowas@1.0.0` (with `validFrom: 1975-05-28`) is correct to include `'MR'` for the period 1975–2000, but the membership list should be temporal: `'MR'` is a member from 1975-05-28 to 2000-12-31.

### 4. 2025 Withdrawals: Burkina Faso, Mali, Niger
On 29 January 2025, Burkina Faso, Mali, and Niger announced their withdrawal from ECOWAS, effective immediately.

However, ECOWAS issued a transitional instruction that citizens of these three states **continue to receive visa-free movement, residence, and establishment rights** until further notice. This means:
- The membership list must distinguish "former member" from "current member."
- The free-movement rights must continue for citizens of these states despite the withdrawal.
- The rule conditions must reference a "rights-eligible national" list, not just a "current member" list.

### 5. Temporal Membership Model
The current model stores ECOWAS member states as a timeless array:
```typescript
const ECOWAS_MEMBER_STATES = ['GH', 'NG', 'TG', ...];
```

This is incorrect for historical evaluation. Membership is temporal:
- `'MR'` was a member 1975–2000 but is not a member in 2025.
- `'BF'`, `'ML'`, `'NE'` were members until 2025-01-29 but retain transitional rights.
- `'GN'` (Guinea) and `'GW'` (Guinea-Bissau) have been members since 1975.

The model must distinguish:
- **Historical membership** (who was a member at a given date)
- **Current membership** (who is a member now)
- **Rights-eligible nationals** (who receives free-movement rights — may include former members with transitional rights)

## Decision (PROPOSED)

### Do NOT modify jur.ecowas@1.0.0
Package immutability (I10) is a frozen invariant. The published 1.0.0 semantic content must not change. Historical evaluation against 1.0.0 continues to use the original list.

### Design jur.ecowas@1.1.0 with temporal membership
The future `jur.ecowas@1.1.0` will:

1. **Correct the member-state codes:**
   - Replace `'GU'` with `'GN'` (Guinea)
   - Add `'GW'` (Guinea-Bissau)

2. **Model membership temporally:**
   Rather than a single timeless array, the package will define a membership timeline:
   ```typescript
   interface MembershipPeriod {
     countryCode: string;
     joinedDate: string;      // ISO date
     withdrewDate?: string;   // ISO date (if withdrawn)
     withdrawalType?: 'full' | 'transitional';
     transitionalRightsEndDate?: string; // if withdrawal is transitional
   }
   ```

3. **Distinguish rights-eligible nationals from current members:**
   The free-movement rules will check against a "rights-eligible" predicate that includes:
   - Current members
   - Former members with transitional rights (Burkina Faso, Mali, Niger — transitional rights ongoing)
   
   Mauritania (withdrew 2000) does NOT have transitional rights — its citizens are not rights-eligible under ECOWAS free movement post-2000.

4. **Rule conditions reference the temporal model:**
   The `conditionNationalityMember` will be replaced with a condition that checks whether the traveler's nationality is rights-eligible **as of the evaluation date** (`asOf`):
   - If `asOf` is 1990: Mauritania is included (member at that time).
   - If `asOf` is 2025-06-01: Burkina Faso, Mali, Niger are included (transitional rights).
   - If `asOf` is 2025-06-01: Mauritania is NOT included (withdrew 2000, no transitional rights).

### Do NOT implement until legal propositions are documented
Per ADR-0023, the new package's rules must carry SourcePropositions with `verificationStatus`. The temporal membership model must be verified against:
- ECOWAS Treaty (Lagos, 1975) — founding membership
- ECOWAS official records of Mauritania's withdrawal (December 2000)
- ECOWAS communiqué on Burkina Faso/Mali/Niger withdrawal (29 January 2025)
- ECOWAS transitional rights instruction for the three withdrawing states

## Alternatives Considered

- **Patch 1.0.0 in place.** Rejected — violates I10.
- **Use a single corrected array (non-temporal).** Rejected — doesn't handle the Mauritania case (was a member 1975–2000, not a member after) or the BF/ML/NE transitional rights case.
- **Use two arrays (current_members + rights_eligible).** Considered — simpler but doesn't support historical evaluation (a decision made in 1990 should see Mauritania as a member).

## Consequences (if implemented)

- `jur.ecowas@1.1.0` carries temporal membership data.
- Historical evaluation against `asOf=1990` includes Mauritania; against `asOf=2025` does not (but includes BF/ML/NE with transitional rights).
- The Ghana→Togo border package will need a minor version bump to use the temporal model.
- `domain.ghana-togo-border@1.1.0`'s `ECOWAS_MEMBER_STATES` constant will be replaced with a temporal lookup.

## Invariants Affected

- I7 (temporal/version metadata) — the membership model becomes explicitly temporal.
- I10 (packages immutable) — 1.0.0 is not modified.
- I13 (historical reproducibility) — 1.0.0 is retained; historical decisions remain reproducible.

## Why This Is PROPOSED, Not ACCEPTED

This requires:
1. Legal verification of the Mauritania withdrawal date (December 2000 — confirmed against ECOWAS official history).
2. Legal verification of the BF/ML/NE withdrawal and transitional rights instruction.
3. Design review of the temporal membership model.
4. SourcePropositions with `verificationStatus: 'LEGALLY_VERIFIED'` for the membership data.

The correction should be published as `jur.ecowas@1.1.0`, not as a patch to 1.0.0.
