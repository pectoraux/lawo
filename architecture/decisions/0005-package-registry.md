# ADR 0005 — Package Manifest and Registry

- **Status:** ACCEPTED
- **Date:** Initial constitution
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Sections 18–20 mandate a package architecture with four categories, a manifest that declares every required field, a registry, and a 10-point quality gate before a package can enter production. Packages must be versioned, signed, immutable after publication, dependency-aware, testable, rollback-able, and provenance-aware.

Without a uniform manifest the platform cannot (a) load packages uniformly, (b) enforce dependency compatibility, (c) verify signatures, or (d) gate quality. Without immutability after publication, historical decisions cannot be reproduced (per I13).

## Decision

Adopt the `PackageManifest` spec (canonical reference: `package-spec/manifest-spec.md`).

### Four package categories

1. `JURISDICTION` — countries, regions, regulators, courts, special zones, supranational/bilateral/international regimes (e.g., Ghana, Togo, ECOWAS, AfCFTA).
2. `DOMAIN` — verticals such as insurance, property, healthcare, employment, tax, immigration, customs, trade, licensing, transportation, energy, procurement.
3. `SITUATION` — situation/procedure packs (e.g., `border_crossing`, `traffic_stop`, `hospital_admission`, `insurance_claim`, `property_purchase`).
4. `CAPABILITY` — connectors and shared capabilities (e.g., OCR pack, Maps connector, government filing connector).

### Required manifest fields

Every manifest declares: `packageId`, `name`, `version`, `category`, `dependencies[]` (each `{ packageId, versionRange }`), `supportedJurisdictions[]`, `domains[]`, `situations[]`, `capabilities[]`, `sources[]`, `rules[]`, `procedures[]`, `actions[]`, `schemas[]`, `testFixtures[]`, `verificationMetadata { signedBy, signedAt, hash }`, `description`.

### 10-point quality gate (section 20)

A package cannot enter production merely because it compiles. It must pass:

1. schema validation
2. source validation
3. rule compilation
4. deterministic tests
5. regression fixtures
6. dependency compatibility
7. provenance completeness
8. version consistency
9. security review
10. domain-specific certification requirements

For high-risk packages, require human review.

### Registry semantics

- The `PackageRegistry` is the single source of truth (see `contracts/package.md`).
- Once `(packageId, version)` is published, it is immutable. Corrections ship as a new version (per I10).
- Packages cannot silently mutate kernel semantics (per I11).
- Dependency `versionRange`s must resolve; circular dependencies are rejected.
- Signatures must verify; unsigned or tampered packages are refused.

## Alternatives considered

- **Single monolithic "rules" package per country.** Rejected: cannot share domain logic (insurance applies across countries); violates I10 and I17.
- **Loose file directories without manifests.** Rejected: no dependency awareness, no signature, no rollback, no reproducibility.
- **Allowing in-place edits to published packages.** Rejected (per I10, I13): breaks historical reproducibility.
- **Skipping the quality gate for "trusted" authors.** Rejected (section 20): the gate is mandatory; high-risk packages require human review.

## Consequences

- Every package ships a manifest; the registry loads manifests and assembles the unified jurisdiction graph, rule set, situation set, procedure set, action set, and source set.
- The `packageId` and `version` are recorded in every `Rule`, `Situation`, `Procedure`, and `Action` so downstream provenance can always trace back to the originating package version (per I6, I13).
- The 10-point gate runs in CI (section 21); a package update that changes the result of an established fixture MUST be flagged explicitly — never silently accepted (per I13). The CI step is `historical-fixture-stability`.
- Packages are independently deployable and rollback-able (per I10). Rollback of a single package does not roll back others; dependency ranges preserve compatibility windows.
- The kernel never imports packages directly. The `PackageRegistry` exposes queries; the kernel consumes what the registry assembles.
- An unsigned or tampered package is refused at load (`SignatureVerificationError`); the registry surfaces the offending `packageId` and the expected vs. computed `hash`.

## Invariants affected

- **I6** — `packageId` and `version` feed provenance for every rule, situation, procedure, action.
- **I7** — rules carry temporal/version metadata; manifests version packages.
- **I10** — packages independently versioned and deployable; immutable after publication; rollback-able.
- **I11** — packages cannot mutate kernel semantics (enforced at load time).
- **I13** — historical decisions reproducible; fixture stability enforced by CI.
- **I14** — manifest schema preserved across releases unless versioned.
- **I16** — no new package category without an ACO.

## Migration implications

- At adoption there are no prior packages. All built-in packages henceforth ship manifests under `src/lib/packages-data/*` and are loaded by `src/packages/loader.ts` into the registry.
- The manifest schema can evolve additively (new optional fields) without an ACO; renames or removals of required fields require an ACO and a major bump.
- A future "package registry v2" (e.g., for distributed publishing) must supersede this ADR, not overwrite it. Old ADRs are kept; the architecture tells a coherent historical story (section 36).
- The architecture test suite (section 34) verifies `package-dependency-rules` (dependency ranges resolve, no cycles), `package-signature-verification` (signatures verify at load), `domain-packages-cannot-mutate-kernel-contracts` (packages don't shadow primitives), and `historical-fixture-stability` (committed fixtures produce recorded outputs).

## References

- `package-spec/manifest-spec.md` — canonical manifest spec, four categories, 10-point gate, immutability rule.
- `contracts/package.md` — `PackageRegistry` contract.
- `contracts/audit.md` — package load events recorded in audit log.
- `decisions/0001-initial-architecture.md` — the kernel/package split this ADR elaborates.
- Source specification sections 18 (package architecture), 19 (package manifest), 20 (quality gates), 21 (legal logic CI/CD).
