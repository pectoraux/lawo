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
| `contracts/entity.md` | `Entity` primitive — generic subject/actor in the system; referenced by `Fact.subjectId`, `ContextRequest.subjectId`, `StateSnapshot.subjectId` | Foundation |
| `contracts/fact.md` | `Fact` primitive — typed observation about a subject; carries `truthLevel` end-to-end; substrate of provenance | Foundation |
| `contracts/jurisdiction.md` | `Jurisdiction` primitive + `JurisdictionGraph` + the 11 relation types — graph model, not a hard-coded hierarchy | Foundation |
| `contracts/rule-ir.md` | `RuleIR` primitive — canonical machine-readable rule representation; `ConditionNode` tree + `RuleEffect[]`; consumed by `RuleEngine` (see `contracts/rule.md`) | Foundation |

### Decisions (`decisions/`)

Architectural Decision Records (ADRs) follow the section 36 template. Old ADRs are superseded, never overwritten. The architecture must tell a coherent historical story.

| Path | Decision |
| --- | --- |
| `decisions/0001-initial-architecture.md` | Adopts the 5-plane frozen architecture and the kernel/package split. |
| `decisions/0002-ruleir-v1.md` | Adopts `RuleIR` as the canonical machine-readable rule representation. |
| `decisions/0003-truth-model.md` | Adopts the T0–T5 truth/confidence hierarchy and the four rule types. |
| `decisions/0004-jurisdiction-graph.md` | Jurisdictions are a graph, not a hard-coded hierarchy. |
| `decisions/0005-package-registry.md` | Adopts the package manifest spec, four package categories, and the 10-point quality gate. |
| `decisions/0006-postgresql-migration.md` | Migrates the data layer from SQLite to PostgreSQL (Neon) for Vercel serverless; native enums + Json columns + `DIRECT_URL` for migrations. |
| `decisions/0007-nextauth-credentials.md` | Adopts NextAuth.js v4 with the Credentials provider + JWT session strategy (30-day maxAge); `authorize()` gates on `status=ACTIVE`. |
| `decisions/0008-waitlist-approval-flow.md` | Adopts the `WaitlistEntry` model + admin approval flow; sign-up → PENDING → admin selects role → APPROVED → set-password → ACTIVE; personal `INDIVIDUAL` tenant per user. |
| `decisions/0009-invitation-tokens.md` | Replaces admin-generated temporary passwords with an invitation-token + set-password flow; admin never handles user passwords. |
| `decisions/0010-no-seed-endpoint.md` | Removes the `/api/seed-demo` endpoint; seeding is an explicit deployment operation (`scripts/seed-users.ts`) only. |
| `decisions/0011-rate-limiting-and-csrf.md` | Adds in-memory rate limiting (per-instance) + Origin-header CSRF checks on all custom POST endpoints; documents the per-instance known limitation. |
| `decisions/0012-tenant-authorization-boundary.md` | Every authenticated API route derives the effective tenant scope from the authenticated session, not from client-supplied `tenantId` / `subjectId` query params; admins get platform-wide read access only via explicit `?platformWide=true`. |
| `decisions/0013-decision-integrity-separation.md` | Separates `DecisionRequest` (client input) from `DecisionRecord` (server-authored output); `POST /api/decisions` is removed — `POST /api/state` with `persist: true` is the only persist path; authoritative fields (`truthLevel`, `provenance`, `state`, `computedAt`) are always engine-generated. |
| `decisions/0014-audit-durability-policy.md` | Splits audit recording into durable `record()` (throws on DB failure; security-sensitive actions roll back on failure) and best-effort `recordBestEffort()` (synthesized non-durable event on failure; informational events only). |
| `decisions/0015-identity-source-of-truth.md` | Deletes the legacy `src/platform/identity/Identity.ts` stub; the NextAuth session backed by the `User` table is the single authoritative identity source; demo quick-login buttons use `DEMO_ACCOUNTS` (UI concern). |
| `decisions/0016-rate-limit-store-abstraction.md` | Abstracts rate limiting behind a `RateLimitStore` interface with `InMemoryRateLimitStore` (per-instance, NOT production-grade) and `SharedRateLimitStore` (stub for future Redis/Upstash); `RATE_LIMIT_ALLOW_IN_MEMORY` acknowledges the limitation. |

### Schemas (`schemas/`)

| Path | Description |
| --- | --- |
| `schemas/rule-ir.schema.md` | Human-readable schema for `RuleIR`, including a JSON example for a customs duty rule. |

### Package specification (`package-spec/`)

| Path | Description |
| --- | --- |
| `package-spec/manifest-spec.md` | The `PackageManifest` spec, four package categories, the 10-point quality gate, immutability-after-publication rule. |

### Architecture tests (`architecture-tests/`)

| Path | Description |
| --- | --- |
| `architecture-tests/run.ts` | The architecture verification suite (section 34). Runs in CI on every meaningful change. Each invariant I1–I18 in `invariants.md` is tagged **Machine-checkable: YES** or **NO** with the corresponding test name. The machine-checkable tests are: `kernel-imports-no-verticals` (I1, I2, I3), `kernel-imports-no-llm` (I5), `provenance-on-decisions` (I6), `temporal-metadata-on-rules` (I7), `package-dependency-rules` (I10), `packages-do-not-mutate-kernel` (I11), `no-feature-specific-hacks-in-kernel` (I16). |
| `architecture-tests/CATEGORIES.md` | Distinguishes the two categories of architecture tests — static boundary tests (source-structure checks in `run.ts`) and runtime invariant tests (behavioral checks in `tests/runtime-security/run.ts`). A PR is not mergeable unless BOTH suites pass. See "Test Categories" below. |

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

## Test Categories

The Nomos architecture test suite has **two categories**. "All tests passing" requires BOTH to pass. See `architecture-tests/CATEGORIES.md` for the full breakdown.

1. **Static Boundary Tests** (`architecture/architecture-tests/run.ts`, `bun run arch-test`, <100 ms) — source-structure checks: kernel imports, code patterns, route-handler signatures. These catch architectural **DRIFT**. 14 checks (I1, I2, I3, I5, I6, I7, I10, I11, I16, AUTHZ, SEC × 4).

2. **Runtime Invariant Tests** (`tests/runtime-security/run.ts`, `bun run runtime-test`, requires a running dev server on `localhost:3000`, ~10–30 s) — behavioral checks with real sessions: tenant isolation, decision integrity, audit authorization, CSRF enforcement, rate limiting. These catch **AUTHORIZATION GAPS** that static tests cannot detect. 15 checks (AUTHZ-001 through AUTHZ-008, INTEGRITY-001 through INTEGRITY-003, WAITLIST-001/002, SETPW-001/002).

**Why both are required.** A route can have a guard call in its source (static pass) but still accept a client-supplied `tenantId` (runtime fail). The authorization sprint's gap — `/api/decisions` and `/api/audit` accepting arbitrary `tenantId`/`subjectId` from the client — passed the static suite (the guard was present) and failed the runtime suite (the data-access layer trusted the client). See ADRs 0012 and 0013 for the gap and the fix.

**CI integration.** Both suites must pass on every PR touching `src/kernel/`, `src/intelligence/`, `src/procedures/`, `src/situations/` (static), `src/app/api/`, `src/lib/auth/`, `src/platform/` (static + runtime), or `prisma/schema.prisma` (runtime — schema changes can affect tenant scoping).

---

## How to Use This Directory

1. **Before writing code**, read `constitution.md` and `invariants.md`.
2. **Before designing a change**, read the relevant `contracts/*.md` and any related ADRs in `decisions/`.
3. **Before implementing a rule**, consult `schemas/rule-ir.schema.md`.
4. **Before shipping a package**, run it against `package-spec/manifest-spec.md` and the 10-point quality gate.
5. **Before claiming "done"**, run the architecture verification suite (see section 34) and ensure all invariants hold.
6. **Before changing architecture**, STOP and follow the ACO process in section 46.

The implementation surface for the contracts is `src/kernel/contracts/contracts.ts` and the related engine signatures. The primitive types live in `src/kernel/primitives/types.ts` (see the worklog "Shared TypeScript Contract Surface" section). When this directory and the implementation disagree, **STOP and report the conflict** — do not silently choose one.
