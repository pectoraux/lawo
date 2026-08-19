# Contract — Tenant (Tenant Isolation)

> Family: Foundation.
> Implementation surface: `src/platform/tenancy/TenantContext.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The tenant subsystem enforces the boundary between `GLOBAL KNOWLEDGE`, `TENANT KNOWLEDGE`, and `USER KNOWLEDGE` (section 24). It supports individual users, households, small businesses, enterprises, professional organizations, government organizations, and embedded customers.

Cross-boundary access requires explicit authorization. Private tenant data cannot enter global knowledge without explicit, authorized publication (per I9).

## Inputs

- `Tenant` — `{ id, name, kind, createdAt }` where `kind ∈ { INDIVIDUAL, HOUSEHOLD, SMALL_BUSINESS, ENTERPRISE, PROFESSIONAL_ORG, GOVERNMENT, EMBEDDED }`
- Every primitive that participates in tenant isolation (`Entity`, `Fact`, `Document`) carries a `tenantId` (`string | null`); `null` means global.
- Caller-supplied tenant context for every query/decision.

## Outputs

- A `TenantContext` providing the current tenant's id and the policies that govern data access
- Filtered query results scoped to the caller's tenant (or global) for every read path
- Audit events for any cross-boundary access attempt

## Errors

- `TenantBoundaryError` — caller attempted to read facts outside its scope without an explicit publish
- `UnauthorizedPublishError` — extension attempted to publish tenant data globally without authorization
- `TenantNotFoundError` — referenced tenant does not exist
- `TenantScopeViolationError` — query attempted across tenants

Errors are structured and surface the offending tenant id.

## Versioning

- The `Tenant` shape is versioned; additive changes are allowed, renames/removals require an ACO.
- Tenant isolation rules are part of the kernel's contract and cannot be relaxed by packages.

## Security

- Reads enforce tenant scope; a tenant can read its own data plus global data, never another tenant's data.
- Cross-tenant access requires an explicit, audited publish.
- Global data is read-only for tenants; only authorized flows can write to global knowledge.
- No tenant data enters training corpora or unscoped retrieval (per section 25).

## Provenance

Tenant-scoped decisions produce normal `Provenance`. The `tenantId` of every fact referenced by a decision must match the calling tenant (or be global). Provenance records the tenant context so historical decisions remain reconstructable (per I6, I13).

## Idempotency

Tenant-filtered reads are pure functions of `(caller_tenant, query)`. The same query from the same tenant returns the same result set (per I13).

## Failure Semantics

- A cross-tenant read is refused; the caller receives `TenantBoundaryError` and the audit log records the attempt.
- A failed tenant lookup never falls back to "global"; the call surfaces an explicit error.
- Tenant scope is enforced at every layer that participates in queries (context, evidence, audit).

## Invariants Enforced

- **I9** — private tenant data cannot enter global knowledge without explicit, authorized publication.
- **I6** — provenance preserves tenant context.
- **I13** — tenant-filtered queries are reproducible.
- **I14** — tenant contract preserved across releases unless versioned.
