# ADR 0004 — Jurisdictions as a Graph

- **Status:** ACCEPTED
- **Date:** Initial constitution
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Section 5 mandates that jurisdictions are a **graph**, not a hard-coded hierarchy. The platform must represent countries, states/provinces, regions, counties, municipalities, regulators, courts, special zones, free zones, supranational regimes, bilateral regimes, regional regimes, and international regimes through the same graph. ECOWAS, AfCFTA, EU, bilateral treaties, national law, municipal law, and regulator guidance must all be representable.

Country is a jurisdiction dimension, **not the primary application boundary**.

Without a graph model the platform would either (a) hard-code a country hierarchy in the kernel (violates I2 — country-specific logic in packages; and I1 — domain-agnostic kernel) or (b) treat country as the application boundary (rejected: would require forking the kernel per country).

## Decision

Adopt the jurisdiction graph model:

### Node shape

A `Jurisdiction` carries:

- `id: string` — stable jurisdiction id (e.g., `jur:gh`, `jur:ecowas`, `jur:afcfta`)
- `code: string` — short code (`GH`, `ECOWAS`, `AfCFTA`)
- `name: string` — display name
- `kind ∈ { COUNTRY, REGION, STATE, MUNICIPALITY, REGULATOR, COURT, SPECIAL_ZONE, FREE_ZONE, SUPRANATIONAL, BILATERAL, INTERNATIONAL }`
- `parentIds: string[]` — convenience parent links (the authoritative structure is the edge set)
- `temporal: TemporalRange` — `validFrom`, `validTo?`, `publishedAt?`, `ingestedAt?`, `version`, `supersedes?`, `supersededBy?`

### Edge shape

A `JurisdictionEdge` carries `{ fromId, toId, relation }` where `relation` is one of the 11 types.

### The 11 relationship types

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

### Graph interface

The `JurisdictionGraph` exposes: `add(j)`, `addEdge(e)`, `get(id)`, `ancestors(id)`, `descendants(id)`, `applicableFor(jurisdictionIds, asOf)`, `relations(id)`.

- `ancestors(id)` traverses `APPLIES_TO`/`DERIVES_FROM` edges.
- `applicableFor(jurisdictionIds, asOf)` returns the jurisdictions whose `temporal` range covers `asOf` and are reachable from the seed set (per I7).
- `relations(id)` returns the edges incident to a jurisdiction.

### Packaging

Country-specific jurisdiction packs (e.g., Ghana, Togo, ECOWAS, AfCFTA) live as packages (`src/lib/packages-data/ghana-jurisdiction.ts`, `ecowas-jurisdiction.ts`, `afcfta-jurisdiction.ts`). The kernel never imports any of them (per I1, I2). The `PackageRegistry` assembles the unified `jurisdictionGraph` from all loaded `JURISDICTION` packages.

## Alternatives considered

- **Hard-coded country hierarchy in the kernel.** Rejected (per I1, I2): the kernel would carry country-specific knowledge and would need to be forked to add a country. The kernel would also need to encode every treaty regime and every free zone, defeating the package model.
- **Single-parent tree.** Rejected: a free zone can be `APPLIES_TO` a country and `DERIVES_FROM` a supranational regime at the same time; a tree cannot express this. ECOWAS applies to Ghana and Togo simultaneously; AfCFTA applies to both plus many others — a tree loses these memberships.
- **Country as the top of the hierarchy.** Rejected (section 5): supranational regimes (ECOWAS, AfCFTA, EU) apply to countries, not the reverse. Putting country at the top would force every treaty to be expressed as a child of every country it touches.
- **Storing relations as a free-form tag set.** Rejected: cannot express `OVERRIDES`, `PREEMPTS`, `EXEMPTS`, `SUPERSEDES` semantics needed for legal evaluation. A tag set has no direction; the graph's directed edges do.
- **Embedding jurisdiction logic in rule conditions.** Rejected: would scatter jurisdiction semantics across every rule, breaking provenance and reproducibility (per I6, I13).

## Consequences

- Every package that ships a jurisdiction ships nodes and edges; the `PackageRegistry` assembles them into one unified `jurisdictionGraph` (per I10, I11). Conflicts (e.g., two packages defining the same jurisdiction id with different shapes) are rejected at load.
- Rule applicability is computed via the graph + temporal range; the kernel's rule/state engines consume the resolved jurisdiction set without knowledge of any specific country.
- Adding a new country, treaty, or free zone is a package operation — no kernel changes (per I1, I2; this is also the section 47 measure of success: add a new country without modifying the kernel).
- `evaluate(as_of = DATE)` requires the graph to honour `temporal` ranges so superseded regimes do not apply retrospectively (per I7, I13). A decision made under an older treaty version remains reconstructable by replaying the graph as of that date.
- Cross-jurisdictional decisions (e.g., a Ghana→Togo border crossing where ECOWAS and AfCFTA both apply) are first-class: the seed set simply includes multiple jurisdiction ids and the graph expands them.

## Invariants affected

- **I1** — domain-agnostic kernel: the kernel knows nothing about specific jurisdictions.
- **I2** — country-specific logic lives in packages: jurisdiction packs carry country nodes and edges.
- **I7** — temporal/version metadata on every jurisdiction; `asOf` honoured by `applicableFor`.
- **I10** — packages independently versioned; jurisdiction packs version independently of each other.
- **I11** — packages cannot mutate kernel semantics: the graph interface is fixed.
- **I13** — historical decisions reproducible via graph + `asOf`; old jurisdiction versions remain available.
- **I14** — graph contract preserved across releases unless versioned.
- **I16** — no new jurisdiction `kind` or `relation` without an ACO.

## Migration implications

- At adoption there is no prior jurisdiction model. All jurisdiction packs henceforth ship as graph nodes and edges.
- The `JurisdictionGraph` interface lives in `src/kernel/jurisdiction/JurisdictionGraph.ts`.
- The `GET /api/jurisdictions` endpoint returns `{ jurisdictions, edges }` (see worklog "Frontend Contract").
- New relationship types can be added only via an ACO; existing relationships cannot be renamed without a major version bump and migration. A breaking change requires a new graph version and a published migration for every consumer (per I14).
- The architecture test suite (section 34) verifies `package-dependency-rules` (jurisdiction packs declare clean dependencies), and the joint fixtures (`fixtures/border-crossing-golden-01.json`) exercise a multi-jurisdiction decision (Ghana + Togo + ECOWAS + AfCFTA).

## References

- `constitution.md` — section 5 (jurisdictions as a graph), section 15 (temporal model).
- `contracts/context.md` — `ContextBuilder` resolves jurisdictions via the graph.
- `contracts/package.md` — `PackageRegistry` assembles the unified graph.
- `fixtures/border-crossing-golden-01.json` — a multi-jurisdiction golden fixture.
- Source specification section 5.
