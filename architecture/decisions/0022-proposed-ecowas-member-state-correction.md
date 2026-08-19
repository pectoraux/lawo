# ADR 0022 (PROPOSED) — ECOWAS Member State Code Correction

**Status:** PROPOSED (legal-data correction — not yet implemented)
**Date:** 2026-08-19
**Decider:** —
**Supersedes:** none
**Superseded by:** —
**References:** ADR 0010 (no-seed-endpoint), ADR 0020 (versioned package registry), I10 (packages immutable after publication)

## Context

An independent audit of `jur.ecowas@1.0.0` found a data discrepancy in the ECOWAS member state list:

1. **Guinea — wrong code.** The published 1.0.0 package uses `'GU'` for Guinea. The correct ISO 3166-1 alpha-2 code is `'GN'`. `'GU'` is the code for Guam (a U.S. territory), not Guinea.

2. **Guinea-Bissau — missing.** Guinea-Bissau (ISO 3166-1 alpha-2: `'GW'`) is a founding member of ECOWAS but is absent from the 1.0.0 member-state list. The list has 15 entries, but one is wrong (`'GU'` instead of `'GN'`) and one member (`'GW'`) is missing. Wait — if 15 entries exist and one is wrong and one is missing, that's 14 correct + 1 wrong = 15, but should be 15 correct. So the list has the right count but wrong content.

3. **Mauritania — potentially stale.** Mauritania (`'MR'`) announced withdrawal from ECOWAS in 2023. As of the 1.0.0 `ingestedAt` (2025-01-01), this withdrawal may have been effective. The 1.0.0 package still includes `'MR'`.

## Decision (PROPOSED)

Do NOT modify `jur.ecowas@1.0.0`. Package immutability is a frozen invariant (I10). The published 1.0.0 semantic content must not silently change.

Instead, create `jur.ecowas@1.1.0` with corrected member-state codes:
- Replace `'GU'` with `'GN'` (Guinea)
- Add `'GW'` (Guinea-Bissau)
- Review `'MR'` (Mauritania) against the actual ECOWAS membership status as of the version's `validFrom`

The 1.1.0 version will supersede 1.0.0 (set `temporal.supersedes` and `supersededBy` fields). Historical evaluation against 1.0.0 will continue to use the original (incorrect) list — this is correct behavior per I13 (historical decisions remain reproducible).

## Alternatives Considered

- **Patch 1.0.0 in place.** Rejected — violates I10 (packages are immutable after publication).
- **Ignore the discrepancy.** Rejected — the wrong code causes rules to fail for Guinean nationals (they would be treated as non-ECOWAS), and Guinea-Bissau nationals are entirely excluded from ECOWAS free movement rules.
- **Delete 1.0.0 and replace.** Rejected — historical decisions that used 1.0.0 would no longer be reproducible (I13).

## Consequences (if implemented)

- `jur.ecowas@1.1.0` corrects the member-state list.
- Historical decisions made against 1.0.0 remain reproducible using the pinned 1.0.0 version.
- New decisions use 1.1.0 (once activated).
- The `domain.ghana-togo-border` package's dependency on `jur.ecowas` uses `^1.0.0`, which covers 1.1.0 (same major).

## Invariants Affected

- I10 (packages immutable after publication) — respected: 1.0.0 is not modified.
- I13 (historical decisions remain reproducible) — respected: 1.0.0 is retained.

## Why This Is PROPOSED, Not ACCEPTED

This requires a legal-data review to confirm:
1. The correct ISO 3166-1 alpha-2 code for Guinea is `'GN'` (verified).
2. Guinea-Bissau's ECOWAS membership status (founding member — should be included).
3. Mauritania's withdrawal effective date and whether 1.0.0's `validFrom` predates it.

The correction should be published as a new package version, not as a patch to the existing one.
