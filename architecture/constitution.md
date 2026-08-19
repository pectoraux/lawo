# Nomos — Platform Constitution

> **Status:** FROZEN. This document is the formal constitution of the Nomos platform.
> It is changed only through an Architecture Change Order (ACO) issued by the project owner (section 46).
> It mirrors sections 1–47 of the source specification.

This constitution describes the architecture **as already decided**. It is not a forward-looking design proposal. Wherever this document and an implementation disagree, the implementation is wrong until either the implementation is corrected or an ACO is issued.

---

## 1. Product Thesis (section 1)

The platform is a **universal rules-and-reality operating system**.

Given:

- a subject
- a context
- a location
- a time
- a situation
- facts
- applicable authorities/rules
- an objective

the system determines:

- what is true
- what is permitted
- what is prohibited
- what is required
- what is owed
- what rights exist
- what options exist
- what the likely consequences are
- what the optimal lawful actions may be
- what actions can be executed
- what evidence supports every material conclusion

### What the platform is NOT

The platform is **not**:

- a collection of vertical SaaS applications
- a generic chatbot
- a legal document database
- an LLM pretending to be a rules engine
- a collection of hard-coded country-specific applications

### Law is one class of rules

The platform also supports regulations, contracts, policies, permits, licenses, institutional procedures, program eligibility, technical requirements, customs rules, trade agreements, operational constraints, and other authoritative or organizational rule systems.

### Core abstraction

```
REALITY  →  FACTS  →  APPLICABLE RULES  →  STATE  →  OPTIONS  →  ACTION  →  EVIDENCE  →  VERIFIED OUTCOME
```

---

## 2. The 5 Frozen Planes (section 2)

The platform consists of five conceptually separated planes. They **must remain conceptually separated**.

### A. Experience Plane

Consumer clients, business clients, enterprise clients, web, mobile, API, embedded experiences, conversational UI, real-time situation UI, maps/navigation UI, document UI.

### B. Intelligence Plane

Context construction, state engine, rule engine, decision engine, optimization engine, procedure engine, workflow engine, agent runtime, action planning.

### C. Knowledge Plane

Entity graph, fact graph, jurisdiction graph, authority graph, rule graph, procedure graph, place graph, evidence graph, temporal/version graph, observational/community layer.

### D. Execution Plane

Government integrations, enterprise integrations, APIs, forms, filings, payments, notifications, document generation, external actions, human-service handoffs.

### E. Platform Foundation

Multi-tenancy, identity, authorization, encryption, auditing, provenance, package registry, package signing, versioning, billing, observability, governance.

---

## 3. The Kernel (section 3)

The kernel **MUST remain domain-agnostic**. Vertical behavior lives in packages.

### Kernel primitives

The kernel exposes these primitives (see `src/kernel/primitives/types.ts` for the authoritative TypeScript surface):

- `Entity`
- `Fact`
- `Relationship`
- `Location`
- `Jurisdiction`
- `Authority`
- `Rule`
- `Definition`
- `Exception`
- `Event`
- `Situation`
- `Procedure`
- `Decision`
- `Option`
- `Action`
- `Document`
- `Evidence`
- `Claim`
- `Right`
- `Obligation`
- `Permission`
- `Restriction`
- `Fee`
- `Actor`
- `Organization`
- `Time`
- `Source`

### Absolute prohibition on vertical-specific kernel concepts

The kernel **MUST NOT** contain vertical-specific concepts such as:

- `InsuranceClaim`
- `ADU`
- `HospitalAssistance`
- `TrafficStop`
- `AfCFTAShipment`

unless such concepts are represented as **package-level compositions over generic primitives**.

### Absolutely forbidden branches in core domain logic

The following patterns are forbidden inside the kernel (per I1):

```ts
// FORBIDDEN
if (insurance) { ... }
if (border) { ... }
if (zoning) { ... }
if (healthcare) { ... }
```

Vertical behavior belongs in packages.

---

## 4. State as a First-Class Concept (section 4)

The platform must compute a current state from:

```
subject + location + time + situation + facts + applicable rules + authorities + evidence  →  STATE
```

State must be **explicit, inspectable, versionable, serializable, and auditable**.

Example state kinds include: immigration eligibility, customs obligations, insurance coverage, property development permissions, worker rights, healthcare entitlements, regulatory compliance status.

The system **must not** bury state calculation inside conversational logic. The state engine is a first-class subsystem. See `contracts/state.md`.

---

## 5. Jurisdictions as a Graph (section 5)

Do **NOT** hard-code a universal jurisdiction hierarchy. **Jurisdictions are a graph.**

### The 11 relationship types

| Relation | Meaning |
| --- | --- |
| `APPLIES_TO` | One jurisdiction applies to another (e.g., a regulation regime applies to a country) |
| `OVERRIDES` | Higher authority displaces lower on overlapping scope |
| `PREEMPTS` | One authority preempts another (e.g., federal preempts state) |
| `IMPLEMENTS` | One jurisdiction implements another (e.g., a country implements a treaty) |
| `DERIVES_FROM` | One jurisdiction derives from another (lineage) |
| `MODIFIES` | One jurisdiction modifies another (e.g., an amendment) |
| `EXEMPTS` | One jurisdiction exempts subjects from another's reach |
| `REFERENCES` | One jurisdiction references another (citation) |
| `SUPERSEDES` | One jurisdiction replaces an earlier one |
| `INTERPRETS` | One jurisdiction interprets another (e.g., a court interpreting a statute) |
| `CONDITIONAL_ON` | Application is conditional on a fact predicate |

### Required jurisdiction kinds

Countries, states/provinces, regions, counties, municipalities, regulators, courts, special zones, free zones, supranational regimes, bilateral regimes, regional regimes, international regimes.

### Examples

ECOWAS, AfCFTA, EU, bilateral treaties, national law, municipal law, regulator guidance **must all be representable through the same graph**.

> **Country is a jurisdiction dimension, NOT the primary application boundary.** (See ADR `decisions/0004-jurisdiction-graph.md`.)

---

## 6. Domain Packs (section 6)

Domains are packages. Examples: insurance, property, healthcare, employment, tax, immigration, customs, trade, licensing, transportation, energy, procurement, etc.

A domain pack may define: domain schemas, facts, rules, procedures, workflows, actions, connectors, document parsers, agents, UI components.

A domain pack **MUST NOT** mutate kernel semantics (per I11).

---

## 7. Situation Packs (section 7)

Situations are first-class. Examples: `traffic_stop`, `border_crossing`, `vehicle_inspection`, `arrest`, `search`, `hospital_admission`, `insurance_claim`, `property_purchase`, `building_permit`, `employment_termination`, `tax_audit`, `government_notice`, `import_shipment`, `export_shipment`, `business_registration`.

A situation is a **state machine** defining:

- entry conditions
- states
- transitions
- required facts
- applicable domains
- actors
- procedures
- possible actions
- exit conditions
- exception paths

Example: `border_crossing` transitions `APPROACH → ORIGIN_EXIT → TRANSITION → DESTINATION_ENTRY → CUSTOMS → COMPLETION`.

The situation engine is responsible for knowing where the user is in the procedure.

---

## 8. Procedure Engine (section 8)

Separate:

- **RULE ENGINE** — "What is legally allowed/required?"
- **PROCEDURE ENGINE** — "What actually happens next in the institutional process?"

A procedure must represent: sequence, branching, actors, location, required documents, accepted alternatives, expected outputs, fees, timing, next step, exception paths.

This supports both digital procedures and physical-world procedures.

---

## 9. Physical World / Place Graph (section 9)

The platform must support real-world procedural navigation. Places include roads, lanes, border facilities, offices, gates, counters, checkpoints, parking, ports, customs offices, immigration offices, inspection points. Places can be linked to procedures and institutional actors.

The system must eventually support prompts such as "Go right.", "Continue straight.", "Join the private vehicle lane.", "The next office is 80 meters ahead.", "Step 4 of 8."

This is **not** decorative maps functionality. Navigation is part of the procedural state system.

---

## 10. Rule Engine Separation from the LLM (section 10)

**LLMs MUST NOT be the authoritative decision engine.**

LLMs MAY:

- extract facts
- interpret documents
- retrieve candidate rules
- translate user language into structured queries
- generate explanations
- assist rule authoring
- plan actions

But authoritative evaluation must happen through **deterministic, inspectable rule/decision machinery** wherever determinism is possible.

### Preferred flow

```
USER  →  LLM / parser  →  structured context  →  rule engine  →  decision/state  →  explanation generator
```

### Never

```
USER  →  LLM  →  unsupported legal conclusion
```

See `contracts/rule.md` and `contracts/decision.md`.

---

## 11. Rule Intermediate Representation (RuleIR) (section 11)

The canonical machine-readable rule representation is **RuleIR**.

RuleIR must support: jurisdiction, authority, source, effective dates, conditions, exceptions, definitions, rights, obligations, permissions, restrictions, consequences, references, discretion, interpretive status.

Authoritative legal text remains the source. RuleIR is a machine-readable representation linked to that source. The compiled runtime representation is generated from RuleIR. **Do not make free-form prose the executable representation.**

See `schemas/rule-ir.schema.md` and ADR `decisions/0002-ruleir-v1.md`.

---

## 12. Rule Types (section 12)

Explicitly distinguish:

- **A. DETERMINISTIC**
- **B. CONDITIONAL**
- **C. DISCRETIONARY / INTERPRETIVE**
- **D. PREDICTIVE**

The system must **never silently transform discretionary or predictive judgments into deterministic legal facts**. Every decision must expose its epistemic status.

---

## 13. Truth / Confidence Model T0–T5 (section 13)

Use the following conceptual hierarchy:

| Level | Meaning |
| --- | --- |
| **T0** | authoritative |
| **T1** | deterministically derived |
| **T2** | established interpretation |
| **T3** | expert interpretation |
| **T4** | community observation |
| **T5** | prediction |

The platform must preserve this distinction throughout: storage, retrieval, reasoning, UI, API, audit logs.

- Never represent community reports as law.
- Never represent predictions as facts.
- Never represent an interpretation as enacted text.

See ADR `decisions/0003-truth-model.md`.

---

## 14. Provenance (section 14)

**Every material conclusion MUST be reconstructable.**

A decision must be traceable through:

```
DECISION  →  RULE  →  SOURCE  →  AUTHORITY  →  VERSION  →  FACTS  →  EVIDENCE  →  CALCULATION  →  ASSUMPTIONS
```

The system must support the questions:

- "What did we know?"
- "When did we know it?"
- "Which version did we use?"
- "Why did we produce this answer?"

This is **non-negotiable** (per I6).

---

## 15. Temporal Model (section 15)

Rules, procedures, sources, facts, documents, interpretations and packages **must support temporal versioning**.

At minimum each carries: `valid_from`, `valid_to`, `published_at`, `ingested_at`, `version`, `supersedes`, `superseded_by`.

The platform must support `evaluate(as_of = DATE)`.

- Do not assume current law applies retrospectively.
- Do not overwrite historical truth.

See `contracts/state.md` and `contracts/rule.md`.

---

## Sections 16–30 — Summary of Additional Invariants

The remaining source-spec sections establish constraints that the constitution enforces through the invariants and contract documents. They are summarized here as pointers; the invariants and contracts carry the operational weight.

- **16. Evidence Graph** — Document pipeline: `INPUT → CLASSIFY → OCR / VISION → EXTRACT → NORMALIZE → ENTITY RESOLUTION → FACTS → EVIDENCE GRAPH`. Document-extracted facts must retain provenance to the underlying page/region/document where practical. See `contracts/evidence.md`.
- **17. Observational / Community Layer** — Community reports must remain separate from authoritative knowledge. Every observation includes source, timestamp, location, context, confidence, corroboration, status. Statuses: `OFFICIAL`, `VERIFIED`, `COMMUNITY-REPORTED`, `UNVERIFIED`, `PREDICTED`. Do not collapse these categories.
- **18. Package Architecture** — Four package categories: `JURISDICTION`, `DOMAIN`, `SITUATION`, `CAPABILITY`. Packages can depend on packages. Packages must be versioned, signed, immutable after publication, dependency-aware, testable, rollback-able, provenance-aware. Use a registry. Treat packages as deployable artifacts. See `contracts/package.md`.
- **19. Package Manifest** — Every package declares: package id, version, dependencies, supported jurisdictions, domains, situations, capabilities, sources, rules, procedures, actions, schemas, test fixtures, verification metadata. The exact syntax may evolve. The semantics may NOT. See `package-spec/manifest-spec.md`.
- **20. Package Quality Gates** — A package cannot enter production merely because it compiles. The 10-point gate is enumerated in `package-spec/manifest-spec.md`.
- **21. Legal Logic CI/CD** — Treat legal/rule packages like software. Every change runs compile, unit tests, golden decisions, historical regression tests, edge cases, dependency tests, provenance tests, temporal tests, authorization tests. A package update that changes the result of an established fixture MUST be flagged explicitly.
- **22. Developer Platform** — The platform exposes an Extension SDK. Extensions receive explicit capabilities. Capability-based permissions: `READ`, `WRITE`, `INVOKE`, `ACT_UPON`. See `contracts/extension.md`.
- **23. API Design** — Conceptual API families: `UNDERSTAND`, `EVALUATE`, `PLAN`, `ACT`, `VERIFY`. APIs must remain domain-neutral.
- **24. Multi-Tenancy** — Support individual users, households, small businesses, enterprises, professional organizations, government organizations, embedded customers. Clear separation between `GLOBAL KNOWLEDGE`, `TENANT KNOWLEDGE`, `USER KNOWLEDGE`. Cross-boundary access requires explicit authorization. See `contracts/tenant.md`.
- **25. Security** — Security is architectural, not an afterthought. Require tenant isolation, least privilege, capability-based extension permissions, encryption at rest and in transit, audit trails, secret management, sensitive-data classification, document access control, policy-based authorization, secure package signing, immutable audit events where appropriate. Never leak private tenant/user data into global retrieval or training systems.
- **26. Offline / Edge Mode** — Certain capabilities must operate offline (e.g., border crossing, travel, traffic stop, field inspection, poor-connectivity environments). Support signed offline bundles containing relevant rules, procedures, maps, critical facts, contacts, decision logic, evidence capture capability. Offline state must reconcile safely after reconnect. Never allow stale offline state to masquerade as current authoritative state. Display package/version freshness.
- **27. Agent Runtime** — Agents orchestrate the system. Agents may gather facts, query knowledge, invoke rules, construct plans, invoke actions, verify outcomes. Agents **MUST NOT** invent authoritative rules. Agents **MUST NOT** bypass provenance. Agents **MUST NOT** circumvent tenant permissions. Agents **MUST NOT** modify rule packages or authoritative knowledge without authorized workflows. All significant agent decisions/actions must be observable and auditable.
- **28. Action Model** — Every recommended action is representable as: `Decision → Action → Preconditions → Execution → Result → Evidence → Updated State`. The goal is to "move the user's real-world state forward correctly", not merely to "answer the user." See `contracts/action.md`.
- **29. Optimization** — Eventually support maximize-objective subject to legal, policy, operational, time, budget, risk constraints. Optimization must never cross legal or policy constraints. Do not optimize around illegal evasion.
- **30. User Safety** — For real-time physical interactions: prioritize safety, avoid escalation, distinguish legal rights from recommended behavior, never encourage physical resistance, never encourage destruction/concealment of evidence, never assist illegal evasion, never present uncertain claims as certainty. In emergency/high-stress modes: simplify UI, prioritize immediate safe actions, preserve the ability to explain later, capture evidence after the immediate risk has passed.

---

## 31. The 18 Architecture Invariants (verbatim)

The following are hard invariants. See `invariants.md` for full rationale and tests.

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

## Sections 32–46 — Process

These sections define the **process** by which the architecture is protected. They are summarized here; the canonical process text lives in the source specification.

- **32. Architectural Escalation Rule** — If implementation requires breaking an invariant: STOP. Do not work around it. Do not silently reinterpret it. Do not create a hidden exception. Produce an `ARCHITECTURE CONFLICT` notice covering requested capability, invariant affected, current implementation, proposed alternative, why current architecture is insufficient, smallest possible architectural change, migration impact, backwards-compatibility impact. Wait for explicit ACO.
- **33. Hardening Sprint Protocol** — Sprint objective is to improve implementation without changing architecture. Before: read constitution, read invariants, inspect architecture, inspect ADRs, inspect tests, identify contract surface. During: smallest safe changes, preserve contracts, add tests before/with fixes, avoid speculative abstraction, avoid changing public semantics, avoid new architectural concepts. After: run the entire architecture verification suite and produce changes made, invariants checked, contracts verified, regressions detected, performance impact, security impact, migration impact, architectural diff. If architecture changed, mark `ARCHITECTURE VIOLATION`. Do not conceal it.
- **34. Architecture Test Suite** — Automated architecture tests verify: core imports no vertical modules; core imports no domain implementation; domain packages cannot mutate kernel contracts; extensions respect capability boundaries; tenant data isolation; provenance on decisions; temporal reproducibility; package dependency rules; rule compilation integrity; historical fixture stability; API backwards compatibility; package signature verification; offline bundle correctness. These are architecture tests, not ordinary unit tests. They must run in CI on every meaningful change.
- **35. Contracts** — Every major subsystem has explicit contracts specifying inputs, outputs, errors, versioning, security, provenance, idempotency, failure semantics. See `contracts/`.
- **36. ADR Discipline** — Every meaningful architectural decision gets an ADR containing title, status, context, decision, alternatives, consequences, invariants affected, migration implications. Do not overwrite old ADRs. Supersede them. The architecture should tell a coherent historical story. See `decisions/`.
- **37. Code Organization** — Organize code so architectural boundaries are physically visible. The exact language/framework may differ. The conceptual boundary must remain. (See worklog "Source Layout" section for the implementation layout.)
- **38. Implementation Style** — Prefer explicit types, immutable value objects, deterministic functions, pure rule evaluation, dependency inversion, dependency injection, explicit state transitions, idempotent actions, structured errors, observable execution, test fixtures, contract tests, property-based tests. Avoid magic behavior, hidden global state, singleton-heavy designs, domain logic in UI/controllers, implicit cross-tenant access, LLM-dependent core decisions, hard-coded jurisdiction logic in infrastructure, feature-specific hacks in the kernel.
- **39. Don't Refactor Sideways** — When fixing a feature do not copy a similar module, add a special-case branch, create another competing abstraction, or duplicate the same concept with a slightly different name. Ask: "Is this genuinely new kernel capability, shared capability, package behavior, or feature-specific behavior?" Put it in the lowest correct layer. The preferred direction is `feature → package → shared capability → kernel`. Never `feature → modify kernel semantics` unless explicitly approved.
- **40. Definition of Done** — A feature is NOT done merely because UI exists, happy path works, or tests pass locally. Done means: architecture preserved; contracts explicit; security boundaries tested; provenance exists; temporal semantics correct; failure modes handled; observability exists; tests include edge cases; backwards compatibility evaluated; package boundaries correct; no hidden coupling introduced; architecture tests pass; documentation matches implementation.
- **41. Implementation Workflow** — For every task: Phase A Orient, Phase B Classify (kernel / shared capability / domain package / jurisdiction package / situation-procedure package / connector / experience / tenant feature), Phase C Design (identify contracts, affected invariants, data model changes, migration risks, test strategy), Phase D Implement (smallest change consistent with architecture), Phase E Verify (unit, integration, contract, architecture, security, package, regression tests), Phase F Audit (provenance, tenancy, temporal, versioning, backward compatibility, architecture boundaries), Phase G Document (ADR, manifest, API contract, architecture docs, changelog).
- **42. When Requirements Are Ambiguous** — Do not invent architecture. Prefer the existing frozen architecture. Use the smallest interpretation that satisfies the request. If ambiguity materially affects architecture: STOP and issue an `ARCHITECTURE QUESTION`. If ambiguity only affects implementation: choose the least invasive implementation and document the assumption.
- **43. When Existing Code Is Wrong** — Do not preserve existing code merely because it exists. The frozen architecture outranks legacy implementation. If existing code violates architecture: identify violation, add regression test, refactor toward architecture, preserve public behavior where possible, document migration. Do not encode legacy mistakes into the architecture.
- **44. When a Hardening Request Conflicts with Architecture** — "Make insurance faster": do not introduce insurance-specific infrastructure into the kernel. "Add border navigation": do not add border-specific concepts to kernel navigation. "Make LLM more accurate": do not move authoritative decisions into LLM inference. "Support country X": do not add country-specific branches to core. Always add capability at the correct package/layer boundary.
- **45. Required Deliverables** — Maintain `architecture/{README.md, constitution.md, invariants.md, contracts/, decisions/, schemas/, package-spec/, fixtures/, diagrams/}`. Every hardening sprint must keep these synchronized with implementation. The constitution changes only through explicit Architecture Change Order.

---

## 46. Architecture Change Order (ACO)

The only legal mechanism for changing frozen architecture is an **ARCHITECTURE CHANGE ORDER**. It must explicitly state:

- change requested
- reason
- current limitation
- architectural invariant affected
- alternatives considered
- new architecture
- compatibility strategy
- migration strategy
- rollback strategy
- affected packages
- affected APIs
- testing requirements

**Without an explicit ACO, DO NOT change the architecture.**

---

## 47. Final Principle

> Build the platform so that tomorrow we can add:
>
> - a new country
> - a new city
> - a new regional treaty
> - a new domain
> - a new border crossing
> - a new document type
> - a new government connector
> - a new agent
> - a new navigation capability
> - a new business vertical
>
> **WITHOUT MODIFYING THE SEMANTICS OF THE KERNEL.**

That is the primary measure of architectural success.

The platform must grow by **COMPOSITION**, not by **branching**. The system should become more capable over time without becoming more coupled. Never trade long-term composability for short-term feature velocity.

When in doubt:

- **PRESERVE THE KERNEL.**
- **EXTEND THE PACK.**
- **PROTECT THE CONTRACT.**
- **PRESERVE PROVENANCE.**
- **MAKE THE CHANGE REVERSIBLE.**

Your role is not merely to make the current feature work.
