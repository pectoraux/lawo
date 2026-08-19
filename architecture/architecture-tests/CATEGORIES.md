# Architecture Test Categories

The Nomos architecture test suite has TWO categories. "All tests passing" requires BOTH.

## 1. Static Boundary Tests (source-structure checks)

**Location:** `architecture/architecture-tests/run.ts`
**Run:** `bun run arch-test`
**What they check:** source file imports, code patterns, route handler signatures.
**What they do NOT check:** runtime behavior, data access patterns, tenant isolation, session handling.

These tests catch architectural DRIFT — e.g., a kernel file importing a vertical module, or a route handler missing a guard call. They run in <100ms because they only read source files.

14 checks:
- I1/I2/I3: kernel-imports-no-verticals
- I5: kernel-imports-no-llm
- I6: provenance-on-decisions (static: source contains provenance attachment)
- I7: temporal-metadata-on-rules
- I10: package-dependency-rules
- I11: packages-do-not-mutate-kernel
- I16: no-feature-specific-hacks-in-kernel
- AUTHZ: privileged-routes-check-authz
- SEC: no-secrets-in-client-code
- SEC: audit-payload-sanitizer
- SEC: no-remote-seeding
- SEC: csrf-on-mutations

## 2. Runtime Invariant Tests (behavioral checks)

**Location:** `tests/runtime-security/run.ts`
**Run:** `bun run runtime-test` (requires a running dev server on localhost:3000)
**What they check:** actual API behavior with real sessions — tenant isolation, decision integrity, audit authorization, CSRF enforcement, rate limiting.
**What they do NOT check:** source structure (that's the static suite's job).

These tests catch AUTHORIZATION GAPS — e.g., a route that checks authentication but not tenant authorization, or a client-forgeable field. They take ~10-30 seconds because they hit the API and DB.

15 checks:
- AUTHZ-001: User A cannot read tenant B decisions
- AUTHZ-002: User A cannot write into tenant B
- AUTHZ-003: User A cannot read tenant B audit events
- AUTHZ-004: Subject access constrained by tenant membership
- AUTHZ-005: Admin platform-wide read (explicit)
- AUTHZ-006: Admin without flag is own-tenant scoped
- AUTHZ-007: Unauthenticated requests rejected
- AUTHZ-008: Cross-origin POST rejected (CSRF)
- INTEGRITY-001: Decision truthLevel not client-forgeable
- INTEGRITY-002: Client tenantId ignored by /api/state
- INTEGRITY-003: Provenance is server-generated
- WAITLIST-001: Approve returns invitation URL (not temp password)
- WAITLIST-002: Non-admin cannot approve
- SETPW-001: Invalid token returns generic error
- SETPW-002: Short password rejected

## Why both categories are required

Static tests pass when the source LOOKS correct. Runtime tests pass when the system BEHAVES correctly. A route can have a guard call in its source (static pass) but still accept a client-supplied tenantId (runtime fail). The previous sprint's 14/14 static pass did not catch the tenant isolation gap because the gap was behavioral, not structural.

## CI Integration

Both suites should run on every PR touching:
- `src/kernel/`, `src/intelligence/`, `src/procedures/`, `src/situations/` (static)
- `src/app/api/`, `src/lib/auth/`, `src/platform/` (static + runtime)
- `prisma/schema.prisma` (runtime — schema changes can affect tenant scoping)

A PR is not mergeable unless BOTH suites pass.
