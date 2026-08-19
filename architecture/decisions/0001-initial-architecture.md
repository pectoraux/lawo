# ADR 0001 — Initial Architecture

- **Status:** ACCEPTED
- **Date:** Initial constitution
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The platform is intended to be a long-lived, jurisdictionally portable, multi-vertical rules-and-reality operating system. Before any feature work, the system needs a stable, frozen architecture that supports:

- jurisdictional portability (add a new country without recompiling the kernel)
- vertical composition (add insurance, customs, healthcare, etc. without forking the kernel)
- auditability and provenance
- deterministic decisions wherever determinism is possible
- multi-tenancy with strict isolation
- backward compatibility across releases
- offline/edge capability where required (border crossings, traffic stops, field inspections, poor-connectivity environments)

Without an initial architecture decision, every subagent would invent its own boundaries and the platform would fragment. Verticals would fork the kernel, jurisdictions would become hard-coded, and provenance would erode into "the LLM said so". The cost of recovering from drift compounds over time, so the architecture is fixed at the outset and only changes via Architecture Change Order (section 46).

The architecture must optimise for (section 0): architectural integrity, composability, correctness, provenance and auditability, deterministic behaviour for authoritative decisions, extensibility, multi-tenancy, jurisdictional portability, offline capability where required, backwards compatibility, testability, and security and isolation. Never sacrifice the architecture merely to make the current feature easier.

## Decision

Adopt the **5-plane frozen architecture** and the **kernel/package split** as the foundation of the platform.

### The 5 planes (section 2)

1. **Experience Plane** — consumer clients, business clients, enterprise clients, web, mobile, API, embedded experiences, conversational UI, real-time situation UI, maps/navigation UI, document UI.
2. **Intelligence Plane** — context construction, state engine, rule engine, decision engine, optimization engine, procedure engine, workflow engine, agent runtime, action planning.
3. **Knowledge Plane** — entity graph, fact graph, jurisdiction graph, authority graph, rule graph, procedure graph, place graph, evidence graph, temporal/version graph, observational/community layer.
4. **Execution Plane** — government integrations, enterprise integrations, APIs, forms, filings, payments, notifications, document generation, external actions, human-service handoffs.
5. **Platform Foundation** — multi-tenancy, identity, authorization, encryption, auditing, provenance, package registry, package signing, versioning, billing, observability, governance.

The planes **must remain conceptually separated** (section 2, final paragraph). Cross-plane coupling is minimised; the Platform Foundation is cross-cutting, not a vertical peer of the others.

### Kernel / package split

The **kernel** (inside the Knowledge plane) is domain-agnostic and exposes the kernel primitives (`Entity`, `Fact`, `Relationship`, `Location`, `Jurisdiction`, `Authority`, `Rule`, `Definition`, `Exception`, `Event`, `Situation`, `Procedure`, `Decision`, `Option`, `Action`, `Document`, `Evidence`, `Claim`, `Right`, `Obligation`, `Permission`, `Restriction`, `Fee`, `Actor`, `Organization`, `Time`, `Source`). Vertical, country-specific, and situation-specific behaviour lives in **packages** composed over those primitives.

The kernel **never** contains vertical-specific types such as `InsuranceClaim`, `ADU`, `HospitalAssistance`, `TrafficStop`, `AfCFTAShipment` unless those concepts are represented as package-level compositions over generic primitives. The kernel **never** contains branches such as `if (insurance)`, `if (border)`, `if (zoning)`, `if (healthcare)` inside core domain logic.

### Change governance

Architecture changes only via Architecture Change Order (section 46). A feature request, bug report, deadline, or implementation convenience is **NOT** permission to alter the architecture (section 0).

## Alternatives considered

- **Monolithic vertical SaaS per country.** Rejected: violates jurisdictional portability and composability; makes adding a country a fork. Each new country would require recompiling the kernel and re-auditing every shared decision.
- **LLM as decision engine.** Rejected (per I5): LLMs hallucinate; authoritative evaluation must be deterministic and inspectable. LLMs may extract facts, retrieve candidate rules, generate explanations, but never produce authoritative legal conclusions.
- **Country as primary application boundary.** Rejected (see ADR 0004): country is a jurisdiction dimension, not the application boundary. Treating it as such would force per-country kernels and lose the unified graph.
- **Single-plane kernel-and-app design.** Rejected: loses conceptual separation, making it hard to evolve planes independently and to enforce tenant boundaries, audit, and provenance as architectural concerns.
- **"Branch on vertical" approach.** Rejected (section 47): the platform grows by **COMPOSITION, not by BRANCHING**. Each new vertical that adds a kernel branch increases the surface every other vertical must support.

## Consequences

- Every subsystem must fit in one of the 5 planes; cross-plane coupling is minimised and visible in the repository layout (`src/kernel/`, `src/intelligence/`, `src/procedures/`, `src/situations/`, `src/packages/`, `src/platform/`, `src/app/`).
- The kernel accepts only domain-agnostic primitives. Adding a new primitive requires justification that more than one independent vertical needs it (per I17); a single feature is never sufficient reason.
- Every package is versioned, signed, immutable after publication, dependency-aware, testable, rollback-able, provenance-aware (per I10). Packages are deployable artifacts (section 18).
- Every material decision carries provenance (per I6). Provenance includes rule, source, authority, version, facts, evidence, calculation, assumptions — supporting "What did we know? When did we know it? Which version did we use? Why did we produce this answer?".
- Every rule carries temporal/version metadata (per I7). `evaluate(as_of = DATE)` is supported throughout.
- Hardening sprints improve implementation; they do not redefine architecture (per I18).
- The architecture test suite (section 34) enforces the planes-and-packages split in CI on every meaningful change.

## Invariants affected

I1 (domain-agnostic kernel), I2 (country logic in packages), I3 (vertical logic in packages), I4 (situation logic in situation/procedure packages), I5 (LLM never authoritative), I6 (provenance), I7 (temporal/version metadata), I10 (packages independently versioned), I11 (packages cannot mutate kernel semantics), I13 (historical decisions reproducible), I14 (backward-compatible contracts), I15 (architecture changes only via ACO), I16 (no new primitive without an ACO), I17 (no duplicate vertical logic), I18 (hardening sprints do not redefine architecture).

## Migration implications

- No prior implementation exists at adoption time; this ADR is the baseline. All future implementation work must conform to it.
- Any divergence requires either refactor-toward-architecture (section 43) or a new ACO. Hidden exceptions are not permitted.
- Repository layout under `src/kernel/`, `src/intelligence/`, `src/procedures/`, `src/situations/`, `src/packages/`, `src/platform/`, `src/app/` (see worklog "Source Layout") reflects this split and must not collapse planes.
- Future revisions supersede this ADR rather than overwrite it; the architecture must tell a coherent historical story (section 36).
- When in doubt: preserve the kernel, extend the pack, protect the contract, preserve provenance, make the change reversible (section 47).

## References

- `constitution.md` — the full formal constitution mirroring sections 1–47.
- `invariants.md` — I1–I18 with rationale and tests.
- `contracts/*.md` — the 11 subsystem contracts referenced by the planes.
- `decisions/0002-ruleir-v1.md` through `decisions/0005-package-registry.md` — companion ADRs that elaborate specific elements of this initial architecture.
