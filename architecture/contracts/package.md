# Contract — Package (PackageManifest + PackageRegistry)

> Family: Foundation.
> Implementation surface: `src/packages/registry/PackageRegistry.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `PackageRegistry` is the single source of truth for all packages (jurisdiction, domain, situation, capability). The `PackageManifest` declares a package's identity, version, dependencies, supported jurisdictions, domains, situations, capabilities, sources, rules, procedures, actions, schemas, test fixtures, and verification metadata.

Packages are deployable artifacts. They must be versioned, signed, immutable after publication, dependency-aware, testable, rollback-able, and provenance-aware (section 18).

## Inputs

- `category?: PackageCategory` — optional filter (`JURISDICTION`, `DOMAIN`, `SITUATION`, `CAPABILITY`)
- `packageId?: string` — to fetch a specific manifest
- `situationId?: string` — to filter procedures by situation
- The registry is populated at boot by `src/packages/loader.ts`, which loads built-in packages from `src/lib/packages-data/*`.

## Outputs

- `listPackages(category?)` → `PackageManifest[]`
- `getPackage(packageId)` → `PackageManifest | undefined`
- `listRules(packageId?)`, `listSituations(packageId?)`, `listProcedures(situationId?)`, `listActions(packageId?)`, `listJurisdictions(packageId?)`, `listAuthorities(packageId?)`, `listSources(packageId?)`
- `jurisdictionGraph: JurisdictionGraph` — the unified jurisdiction graph across all loaded packages

## Errors

- `PackageNotFoundError` — `packageId` not in registry
- `DependencyResolutionError` — a declared dependency is not registered or its version is out of range
- `SignatureVerificationError` — a package's `verificationMetadata.hash` does not match
- `CircularDependencyError` — package dependency graph contains a cycle

Errors are structured.

## Versioning

- Every package carries its own `version` (independent of other packages and of the kernel) (per I10).
- A `versionRange` declares acceptable dependency versions; the registry refuses to load packages whose dependencies do not resolve.
- Once a `(packageId, version)` is published it is immutable; corrections ship as a new version (per I10).

## Security

- Packages are signed (`verificationMetadata.signedBy`, `signedAt`, `hash`); the registry refuses to load unsigned or tampered packages.
- Packages cannot mutate kernel semantics (per I11).
- Loading a package is a privileged operation; tenant-facing registries expose only vetted packages.

## Provenance

- The `packageId` is recorded in every `Rule`, `Situation`, `Procedure`, and `Action` so downstream provenance can always trace back to the originating package version (per I6).
- Package versions feed the reproducibility of historical decisions (per I13).

## Idempotency

Loading the same set of packages always produces the same registry state. The registry exposes deterministic queries: identical inputs yield identical outputs (per I13).

## Failure Semantics

- A package with a failing dependency is rejected at load; the registry does not partially load.
- A signature mismatch aborts loading for that package only; other packages continue to load if their dependencies remain satisfied.
- A circular dependency aborts loading of the affected subgraph.

## Invariants Enforced

- **I10** — packages independently versioned and deployable.
- **I11** — packages cannot mutate kernel semantics.
- **I6** — package ids feed downstream provenance.
- **I13** — registry is reproducible.
- **I14** — manifest schema preserved across releases unless versioned.
