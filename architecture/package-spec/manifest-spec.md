# Package Manifest Specification

> Source: sections 18–20 of the source specification; ADR `decisions/0005-package-registry.md`.
> Authoritative TypeScript surface: `PackageManifest`, `PackageCategory` in `src/kernel/primitives/types.ts` (see kernel primitives).
> Status: FROZEN. Changes require an ACO.

Every package declares a `PackageManifest`. The exact syntax may evolve; the semantics may NOT (section 19).

---

## Required fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `packageId` | `string` | yes | Stable package identifier (e.g., `jur:ghana`, `dom:customs`, `sit:border_crossing`, `cap:ocr`) |
| `name` | `string` | yes | Human-readable name |
| `version` | `string` | yes | Semantic version of this package; independent of the kernel and other packages (per I10) |
| `category` | `PackageCategory` | yes | One of `JURISDICTION`, `DOMAIN`, `SITUATION`, `CAPABILITY` |
| `dependencies` | `{ packageId: string; versionRange: string }[]` | yes | Declared dependencies with semver-style ranges; must resolve or the package is refused |
| `supportedJurisdictions` | `string[]` | yes | Jurisdiction ids the package applies to |
| `domains` | `string[]` | yes | Domain codes the package contributes to (e.g., `customs`, `insurance`) |
| `situations` | `string[]` | yes | Situation codes the package contributes to (e.g., `border_crossing`) |
| `capabilities` | `string[]` | yes | Capability codes the package contributes to (e.g., `ocr`, `maps_connector`) |
| `sources` | `string[]` | yes | `sourceId`s the package publishes (e.g., statutory texts, treaty articles) |
| `rules` | `string[]` | yes | `ruleId`s the package publishes |
| `procedures` | `string[]` | yes | `procedureId`s the package publishes |
| `actions` | `string[]` | yes | `actionId`s the package publishes |
| `schemas` | `string[]` | yes | Schema ids the package publishes (e.g., `customs:goods_v1`) |
| `testFixtures` | `string[]` | yes | Fixture ids the package ships (used by the regression suite) |
| `verificationMetadata` | `{ signedBy: string; signedAt: string; hash: string }` | yes | Package signature data; unsigned or tampered packages are refused |
| `description` | `string` | yes | Free-text description for the registry UI |

Empty arrays are allowed where a package legitimately does not contribute (e.g., a `CAPABILITY` package may have empty `supportedJurisdictions`).

---

## Four package categories

### 1. JURISDICTION

Countries, regions, regulators, courts, special zones, free zones, supranational, bilateral, regional, and international regimes.

Examples: Ghana jurisdiction, Togo jurisdiction, ECOWAS pack, AfCFTA pack.

### 2. DOMAIN

Verticals.

Examples: insurance, property, healthcare, employment, tax, immigration, customs, trade, licensing, transportation, energy, procurement.

A domain pack may define domain schemas, facts, rules, procedures, workflows, actions, connectors, document parsers, agents, UI components. A domain pack **MUST NOT** mutate kernel semantics (per I11).

### 3. SITUATION

Situation/procedure packs. A situation is a state machine defining entry conditions, states, transitions, required facts, applicable domains, actors, procedures, possible actions, exit conditions, exception paths.

Examples: `border_crossing`, `traffic_stop`, `vehicle_inspection`, `arrest`, `search`, `hospital_admission`, `insurance_claim`, `property_purchase`, `building_permit`, `employment_termination`, `tax_audit`, `government_notice`, `import_shipment`, `export_shipment`, `business_registration`.

### 4. CAPABILITY

Connectors and shared capabilities.

Examples: OCR pack, Maps connector, government filing connector.

---

## 10-point quality gate (section 20)

A package cannot enter production merely because it compiles. It must pass:

| # | Gate | What it verifies |
| --- | --- | --- |
| 1 | Schema validation | Every published schema id resolves and conforms to the kernel's primitive types |
| 2 | Source validation | Every `sourceId` referenced by rules exists and carries `authorityId` and `citation` |
| 3 | Rule compilation | Every rule's `RuleIR` compiles to a valid `ConditionNode` tree with at least one effect |
| 4 | Deterministic tests | The package's deterministic test suite passes against the published `RuleEngine` version |
| 5 | Regression fixtures | Every fixture in `testFixtures` produces the recorded expected output (per I13) |
| 6 | Dependency compatibility | Every declared `versionRange` resolves against currently registered packages; no cycles |
| 7 | Provenance completeness | Every material decision in the fixtures carries non-empty `Provenance` (per I6) |
| 8 | Version consistency | The manifest's `version` is greater than any prior published version of the same `packageId`; `supersedes`/`supersededBy` is consistent |
| 9 | Security review | Capability declarations, tenant boundaries, and signature verified; no undeclared privileged calls |
| 10 | Domain-specific certification | Domain-specific requirements (e.g., legal review for `JURISDICTION` packs, medical accuracy for `healthcare` domain) met |

For high-risk packages, require human review.

A package update that changes the result of an established fixture MUST be flagged explicitly (section 21). Never silently accept semantic regressions.

---

## Immutability after publication

Once `(packageId, version)` is published, the manifest and its contents are immutable. Corrections ship as a new version (per I10). This is the foundation of historical reproducibility (per I13).

- The registry refuses to load a package whose `verificationMetadata.hash` does not match the published content.
- A newer version of a package does not mutate prior versions; both remain available so historical decisions can be replayed with the original versions.
- Rollback is per-package: a single package can be rolled back without affecting others (per I10).

---

## Registry semantics (summary)

The `PackageRegistry` (see `contracts/package.md`) is the single source of truth. It exposes:

- `listPackages(category?)`, `getPackage(packageId)`
- `listRules(packageId?)`, `listSituations(packageId?)`, `listProcedures(situationId?)`, `listActions(packageId?)`
- `listJurisdictions(packageId?)`, `listAuthorities(packageId?)`, `listSources(packageId?)`
- `jurisdictionGraph` — the unified graph across all loaded packages

The registry assembles one unified jurisdiction graph from the `JURISDICTION` packages; this graph is consumed by `ContextBuilder` and the rule/state engines without any kernel knowledge of specific jurisdictions (per I1, I2).

---

## Invariants enforced

- **I6** — `packageId` and `version` recorded in every rule, situation, procedure, action for provenance.
- **I7** — packages carry temporal/version metadata; rules inherit from packages.
- **I10** — packages independently versioned and deployable; immutable after publication; rollback-able.
- **I11** — packages cannot mutate kernel semantics (enforced at load time).
- **I13** — historical decisions remain reproducible because old package versions remain available.
- **I14** — manifest schema preserved across releases unless versioned.
- **I16** — no new package category without an ACO.

## See also

- `contracts/package.md` — `PackageRegistry` contract.
- `decisions/0005-package-registry.md` — the ADR that adopted the manifest spec.
- `fixtures/border-crossing-golden-01.json` — a golden fixture that exercises packages across categories.
