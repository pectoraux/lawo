# Nomos — Architecture Directory

> The frozen constitution of the Universal Rules-and-Reality Operating System.

This directory is the **authoritative source of truth** for the architecture of the Nomos platform. The architecture is **FROZEN**. It changes only through an explicit **Architecture Change Order (ACO)** issued by the project owner (see section 46 of the source specification and the workflow described in `decisions/`).

A feature request, bug report, developer preference, framework limitation, deadline, or implementation convenience is **NOT** permission to alter the architecture. If implementation requires breaking an invariant, you must STOP and produce an `ARCHITECTURE CONFLICT` notice as described in section 32 of the source specification.

---

## File Map

Every file in this directory serves a specific role in the constitution. They are listed below with a one-line description.

### Top-level documents

| Path | Description |
| --- | --- |
| `README.md` | This file. The map of the architecture directory and the FROZEN contract notice. |
| `constitution.md` | The formal constitution: product thesis, 5 planes, kernel primitives, state model, jurisdiction graph, rule engine separation, RuleIR, truth model, invariants, final principle. |
| `invariants.md` | The 18 hard invariants (I1–I18) verbatim, with rationale, violations, code examples, and tests. |

### Contracts (`contracts/`)

One markdown file per major subsystem. Each contract specifies Purpose, Inputs, Outputs, Errors, Versioning, Security, Provenance, Idempotency, Failure Semantics, and Invariants Enforced.

| Path | Subsystem | Family |
| --- | --- | --- |
| `contracts/context.md` | `ContextBuilder` — resolves facts/jurisdictions/authorities/rules/evidence into a bundle | UNDERSTAND |
| `contracts/state.md` | `StateEngine` — computes the `StateSnapshot` from a bundle and rules | EVALUATE |
| `contracts/rule.md` | `RuleEngine` + `RuleIR` — deterministic evaluation of `ConditionNode` trees | EVALUATE |
| `contracts/decision.md` | `DecisionEngine` — orchestrates context→rules→state→provenance→audit | EVALUATE |
| `contracts/evidence.md` | `EvidenceGraph` — document pipeline INPUT→CLASSIFY→OCR/VISION→EXTRACT→NORMALIZE→ENTITY RESOLUTION→FACTS→EVIDENCE GRAPH | UNDERSTAND |
| `contracts/procedure.md` | `ProcedureEngine` — sequence/branching/actors/documents/alternatives/outputs/fees/timing/next/exception | PLAN |
| `contracts/action.md` | `ActionModel` — Decision→Action→Preconditions→Execution→Result→Evidence→Updated State | ACT |
| `contracts/package.md` | `PackageManifest` + `PackageRegistry` — versioned/signed/immutable/dependency-aware | Foundation |
| `contracts/extension.md` | Extension SDK — capability-based permissions READ/WRITE/INVOKE/ACT_UPON | Foundation |
| `contracts/tenant.md` | Tenant isolation — GLOBAL/TENANT/USER knowledge boundaries | Foundation |
| `contracts/audit.md` | `AuditEvent` trail — immutable where appropriate | Foundation |

### Decisions (`decisions/`)

Architectural Decision Records (ADRs) follow the section 36 template. Old ADRs are superseded, never overwritten. The architecture must tell a coherent historical story.

| Path | Decision |
| --- | --- |
| `decisions/0001-initial-architecture.md` | Adopts the 5-plane frozen architecture and the kernel/package split. |
| `decisions/0002-ruleir-v1.md` | Adopts `RuleIR` as the canonical machine-readable rule representation. |
| `decisions/0003-truth-model.md` | Adopts the T0–T5 truth/confidence hierarchy and the four rule types. |
| `decisions/0004-jurisdiction-graph.md` | Jurisdictions are a graph, not a hard-coded hierarchy. |
| `decisions/0005-package-registry.md` | Adopts the package manifest spec, four package categories, and the 10-point quality gate. |

### Schemas (`schemas/`)

| Path | Description |
| --- | --- |
| `schemas/rule-ir.schema.md` | Human-readable schema for `RuleIR`, including a JSON example for a customs duty rule. |

### Package specification (`package-spec/`)

| Path | Description |
| --- | --- |
| `package-spec/manifest-spec.md` | The `PackageManifest` spec, four package categories, the 10-point quality gate, immutability-after-publication rule. |

### Fixtures (`fixtures/`)

| Path | Description |
| --- | --- |
| `fixtures/border-crossing-golden-01.json` | Golden decision fixture for a Ghana→Togo border crossing via Aflao; reproducible across runs (per I13). |

### Diagrams (`diagrams/`)

| Path | Description |
| --- | --- |
| `diagrams/planes.md` | The 5 planes with the kernel at the center, packages orbiting, and the request flow. |

---

## The 5 Planes

The platform consists of five conceptually separated planes (section 2 of the source specification). They must remain conceptually separated.

| Plane | Purpose | Sub-components |
| --- | --- | --- |
| **A. Experience Plane** | Consumer, business, enterprise, web, mobile, API, embedded, conversational, real-time situation, maps/navigation, document UI. | consumer clients, business clients, enterprise clients, web, mobile, API, embedded experiences, conversational UI, real-time situation UI, maps/navigation UI, document UI |
| **B. Intelligence Plane** | Computation of state and decisions. | context construction, state engine, rule engine, decision engine, optimization engine, procedure engine, workflow engine, agent runtime, action planning |
| **C. Knowledge Plane** | The graphs that hold reality. | entity graph, fact graph, jurisdiction graph, authority graph, rule graph, procedure graph, place graph, evidence graph, temporal/version graph, observational/community layer |
| **D. Execution Plane** | Things that act in the world. | government integrations, enterprise integrations, APIs, forms, filings, payments, notifications, document generation, external actions, human-service handoffs |
| **E. Platform Foundation** | Cross-cutting capabilities. | multi-tenancy, identity, authorization, encryption, auditing, provenance, package registry, package signing, versioning, billing, observability, governance |

The kernel lives at the center of plane C and is consumed by planes B and D. Plane A and Plane E are consumers/cross-cutting concerns. Vertical behavior (insurance, customs, healthcare, etc.) **never** enters the kernel; it lives in packages.

---

## The 18 Architecture Invariants (section 31)

The following are hard invariants. Violations require either rejecting the change or issuing an Architecture Change Order (ACO). See `invariants.md` for full rationale, code examples, and tests.

- **I1.** Core remains domain-agnostic.
- **I2.** Country-specific logic lives in packages.
- **I3.** Vertical-specific logic lives in packages.
- **I4.** Situation-specific logic lives in situation/procedure packages.
- **I5.** LLM output is never authoritative legal truth.
- **I6.** Every material decision has provenance.
- **I7.** Every rule has temporal/version metadata.
- **I8.** Community observations cannot masquerade as authority.
- **I9.** Private tenant data cannot enter global knowledge without explicit, authorized publication.
- **I10.** Packages are independently versioned and deployable.
- **I11.** Packages cannot silently mutate kernel semantics.
- **I12.** Extensions cannot bypass capability permissions.
- **I13.** Historical decisions remain reproducible.
- **I14.** Production changes must preserve backward-compatible contracts unless explicitly versioned.
- **I15.** Architecture is changed only through an Architecture Change Order.
- **I16.** No feature may introduce a new architectural primitive merely because it makes one feature easier.
- **I17.** Repeated code across verticals is evidence to improve the kernel or create a shared capability, not evidence to duplicate vertical logic.
- **I18.** A hardening sprint may improve implementation but may not redefine architecture.

---

## How to Use This Directory

1. **Before writing code**, read `constitution.md` and `invariants.md`.
2. **Before designing a change**, read the relevant `contracts/*.md` and any related ADRs in `decisions/`.
3. **Before implementing a rule**, consult `schemas/rule-ir.schema.md`.
4. **Before shipping a package**, run it against `package-spec/manifest-spec.md` and the 10-point quality gate.
5. **Before claiming "done"**, run the architecture verification suite (see section 34) and ensure all invariants hold.
6. **Before changing architecture**, STOP and follow the ACO process in section 46.

The implementation surface for the contracts is `src/kernel/contracts/contracts.ts` and the related engine signatures. The primitive types live in `src/kernel/primitives/types.ts` (see the worklog "Shared TypeScript Contract Surface" section). When this directory and the implementation disagree, **STOP and report the conflict** — do not silently choose one.
