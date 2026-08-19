# Contract — Jurisdiction (Jurisdiction Graph + 11 Relation Types)

> Family: Foundation.
> Implementation surfaces: `src/kernel/jurisdiction/JurisdictionGraph.ts` (the in-memory graph implementation), `src/kernel/contracts/contracts.ts` (the `JurisdictionGraph` interface); primitives in `src/kernel/primitives/types.ts` (`Jurisdiction`, `JurisdictionKind`, `JurisdictionEdge`, `JurisdictionRelation`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The jurisdiction subsystem represents countries, states/provinces, regions, counties, municipalities, regulators, courts, special zones, free zones, supranational regimes, bilateral regimes, regional regimes, and international regimes as a **graph** — not a hard-coded hierarchy (section 5, per ADR 0004). Country is a jurisdiction dimension, **not the primary application boundary**.

The graph is the substrate on which rule applicability is computed. `ContextBuilder` resolves the applicable jurisdiction set via `applicableFor(jurisdictionIds, asOf)`; the rule engine then filters rules to those whose `jurisdictionId` is in that set. ECOWAS, AfCFTA, EU, bilateral treaties, national law, municipal law, and regulator guidance MUST all be representable through the same graph (per I2).

The `JurisdictionGraph` is the only authoritative structure for jurisdiction relationships in the platform. It is assembled by the `PackageRegistry` from all loaded `JURISDICTION` packages (per I10, I11). The kernel never imports a specific jurisdiction pack (per I1, I2).

## Inputs

### Node shape (`Jurisdiction`)

- `id: string` — stable jurisdiction id (e.g., `jur:gh`, `jur:ecowas`, `jur:afcfta`)
- `code: string` — short code (`GH`, `ECOWAS`, `AfCFTA`)
- `name: string` — display name
- `kind: JurisdictionKind ∈ { COUNTRY, REGION, STATE, MUNICIPALITY, REGULATOR, COURT, SPECIAL_ZONE, FREE_ZONE, SUPRANATIONAL, BILATERAL, INTERNATIONAL }`
- `parentIds: string[]` — convenience upward links (the authoritative structure is the edge set)
- `temporal: TemporalRange` — `validFrom`, `validTo?`, `publishedAt?`, `ingestedAt?`, `version`, `supersedes?`, `supersededBy?`

### Edge shape (`JurisdictionEdge`)

- `fromId: string` — source jurisdiction id
- `toId: string` — target jurisdiction id
- `relation: JurisdictionRelation` — one of the 11 frozen relation types

### The 11 frozen relation types

| Relation | Meaning |
| --- | --- |
| `APPLIES_TO` | One jurisdiction applies to another (e.g., a regime applies to a country) |
| `OVERRIDES` | Higher authority displaces lower on overlapping scope |
| `PREEMPTS` | One authority preempts another (e.g., federal preempts state) |
| `IMPLEMENTS` | One jurisdiction implements another (e.g., a country implements a treaty) |
| `DERIVES_FROM` | Lineage: one jurisdiction derives from another |
| `MODIFIES` | One jurisdiction modifies another (e.g., an amendment) |
| `EXEMPTS` | One jurisdiction exempts subjects from another's reach |
| `REFERENCES` | One jurisdiction references another (citation) |
| `SUPERSEDES` | One jurisdiction replaces an earlier one |
| `INTERPRETS` | One jurisdiction interprets another (e.g., a court interpreting a statute) |
| `CONDITIONAL_ON` | Application is conditional on a fact predicate |

### Graph interface (`JurisdictionGraph`)

- `add(j: Jurisdiction): void` — register a node
- `addEdge(e: JurisdictionEdge): void` — register a directed edge
- `get(id: string): Jurisdiction | undefined` — fetch a node
- `ancestors(id: string): Jurisdiction[]` — traverse `APPLIES_TO` / `DERIVES_FROM` / `IMPLEMENTS` / `REFERENCES` / `INTERPRETS` upward, nearest-first, deduplicated, cycle-safe
- `descendants(id: string): Jurisdiction[]` — traverse the inverse of `OVERRIDES` / `PREEMPTS` / `MODIFIES` / `EXEMPTS` / `CONDITIONAL_ON` / `SUPERSEDES` downward, nearest-first, deduplicated, cycle-safe
- `applicableFor(jurisdictionIds: string[], asOf: string): Jurisdiction[]` — the union of the given jurisdictions and all their ancestors, filtered to those whose `temporal` range covers `asOf`
- `relations(id: string): JurisdictionEdge[]` — all edges incident to a jurisdiction (out-edges first, then in-edges, stable insertion order)

## Outputs

- `applicableFor(jurisdictionIds, asOf)` — `Jurisdiction[]` consumed by `ContextBuilder` to build `resolvedJurisdictions` and to filter `applicableRules`
- `ancestors(id)` / `descendants(id)` — `Jurisdiction[]` used for graph navigation in UIs and connectors
- `relations(id)` — `JurisdictionEdge[]` used by the UI to render the graph and by connectors to traverse authority chains
- `all()` / `allEdges()` — full enumeration used by `GET /api/jurisdictions` and by the `PackageRegistry` assembly

## Errors

- `UnknownJurisdictionError` — `get(id)` for an id not in the graph; `applicableFor` skips unknown ids rather than raising
- `MalformedJurisdictionError` — `id`, `code`, `name`, `kind`, or `temporal.validFrom` missing; `kind` is not a member of the frozen enum
- `MalformedJurisdictionEdgeError` — `fromId`/`toId`/`relation` missing; `relation` is not one of the 11 frozen types
- `TemporalRangeError` — `asOf` precedes the earliest known `validFrom` for a required jurisdiction; recorded as a skip with marker, not raised
- `DuplicateJurisdictionError` (at registry load) — two packages define the same jurisdiction id with divergent shapes (per `contracts/package.md`)

Errors are structured (`{ code, message, context }`) and never raise silent exceptions.

## Versioning

- The `Jurisdiction`, `JurisdictionEdge`, `JurisdictionKind`, and `JurisdictionRelation` shapes are versioned. Additive changes (new optional fields) are allowed. Renames or removals require a new major version and an ACO.
- New `JurisdictionKind` or `JurisdictionRelation` values require an ACO (per I16) — they cannot be added as part of a feature sprint (per I18).
- The traversal semantics (`ancestors`, `descendants`, `applicableFor`) are part of the contract; changing which relations are traversed upward vs downward is a contract change requiring an ACO.
- The algorithm version is recorded so historical graph queries remain reproducible (per I13).

## Security

- The graph itself carries no tenant scope — jurisdictions are global knowledge. However, the `PackageRegistry` exposes jurisdiction queries that are tenant-aware: a tenant can read all jurisdictions (they are global) but cannot author jurisdiction packs unless authorised (per I9, I11).
- Loading a `JURISDICTION` package is a privileged operation; the registry refuses unsigned or tampered packages (per `contracts/package.md`).
- The graph implementation holds no secrets; `code` and `name` are display-only.

## Provenance

- The `jurisdictionId` on every `Rule` references a `Jurisdiction.id` in the graph; downstream provenance preserves the jurisdiction set resolved at decision time so historical decisions remain reconstructable (per I6, I13).
- `applicableFor(jurisdictionIds, asOf)` is deterministic: same inputs always yield the same resolved jurisdiction set, byte-for-byte (per I13). A decision made last year under an older treaty version is reconstructable by replaying the graph as of that date.
- The graph records `temporal.supersedes` / `supersededBy` so superseded regimes are discoverable for historical replay even after new versions are published.

## Idempotency

- `add(j)` and `addEdge(e)` are idempotent per `(id)` / `(fromId, toId, relation)` — re-adding the same node or edge produces no change.
- `applicableFor(jurisdictionIds, asOf)` is a pure function of `(graph, jurisdictionIds, asOf)`. Same inputs → identical output, byte-for-byte. Determinism is a hard contract (per I5, I13).
- `ancestors(id)` and `descendants(id)` are pure functions of `(graph, id)`; both are cycle-safe via visited-set deduplication.
- Loading the same set of `JURISDICTION` packages always produces the same graph state (per I13).

## Failure Semantics

- A jurisdiction id passed to `applicableFor` that does not resolve in the graph is skipped — the call returns the resolved subset rather than failing. This supports partial-failure scenarios where a package is mid-load.
- A jurisdiction whose `temporal` range does not cover `asOf` is excluded from `applicableFor` results (per I7); the engine records the skip in the calculation trace rather than raising.
- A circular `SUPERSEDES` chain is broken by the cycle-safe traversal — the engine returns the discovered set rather than looping forever.
- A duplicate jurisdiction definition across packages is rejected at registry load (`DuplicateJurisdictionError`); the registry does not silently merge divergent shapes (per I11).
- A malformed edge with an unknown `relation` is rejected at registry load (`MalformedJurisdictionEdgeError`); the registry does not silently coerce.

## Invariants Enforced

- **I1** — `JurisdictionGraph` is domain-agnostic; the kernel knows nothing about specific jurisdictions.
- **I2** — country-specific logic lives in `JURISDICTION` packages; the kernel consumes the assembled graph.
- **I7** — every `Jurisdiction` carries `temporal: TemporalRange`; `applicableFor` honours `asOf`.
- **I10** — jurisdiction packs version independently of each other and of the kernel.
- **I11** — packages cannot mutate the graph interface; they only contribute nodes and edges.
- **I13** — historical decisions reproducible via graph + `asOf`; old jurisdiction versions remain available.
- **I14** — graph contract preserved across releases unless versioned.
- **I16** — no new `JurisdictionKind` or `JurisdictionRelation` without an ACO.

## References

- `constitution.md` — section 5 (jurisdictions as a graph), section 15 (temporal model), section 18 (package categories — `JURISDICTION`).
- `contracts/context.md` — `ContextBuilder` resolves jurisdictions via `applicableFor`.
- `contracts/rule.md` — rules carry `jurisdictionId` filtered against the resolved set.
- `contracts/state.md` — `StateSnapshot.jurisdictionIds` records the resolved set for the snapshot.
- `contracts/package.md` — `PackageRegistry` assembles the unified graph.
- `decisions/0004-jurisdiction-graph.md` — the ADR that established the graph model and the 11 relation types.
- `decisions/0001-initial-architecture.md` — the kernel/package split that places the graph in the kernel.
- `fixtures/border-crossing-golden-01.json` — a multi-jurisdiction golden fixture (Ghana + Togo + ECOWAS + AfCFTA).
- `src/kernel/jurisdiction/JurisdictionGraph.ts` — authoritative in-memory graph implementation.
- `src/kernel/primitives/types.ts` — authoritative `Jurisdiction` / `JurisdictionEdge` / `JurisdictionKind` / `JurisdictionRelation` surfaces.
