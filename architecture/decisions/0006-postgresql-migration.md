# ADR 0006 — PostgreSQL (Neon) Migration for Production

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The platform was originally prototyped against SQLite via Prisma (`package.json` stack line: "Prisma (SQLite)"). SQLite is a single-file, file-system-backed database. The deployment target for production is Vercel serverless, where filesystem state is **ephemeral and per-instance**. A SQLite file written during one invocation is not visible to the next invocation; on a fresh cold-start the file is empty. This makes SQLite unsuitable as a production data store for the platform.

The kernel contract surface (sections 3, 24, 25) requires: durable users, durable tenants, durable audit events, durable waitlist entries, durable invitation tokens, and durable knowledge-graph facts. None of these can survive on a Vercel serverless filesystem. The platform needs a **networked** database that persists across invocations and is reachable from any Vercel region.

This ADR concerns the **data layer only**. The kernel primitives (`Entity`, `Fact`, `Jurisdiction`, `Rule`, `RuleIR`, `Tenant`, `AuditEvent`) are FROZEN and are not affected by the storage choice — they remain the authoritative TypeScript surface in `src/kernel/primitives/types.ts`. The decision here is about how the persistence layer maps those primitives to a physical schema.

## Decision

Adopt **PostgreSQL** (hosted on Neon) as the production database. Update the Prisma schema and connection configuration to target PostgreSQL.

### Schema mapping

The Prisma schema maps the kernel primitives to PostgreSQL tables. Where the kernel exposes a closed enum (`UserRole`, `UserStatus`, `TenantKind`, `AuditSeverity`, `TruthLevel`, `PackageCategory`, `JurisdictionKind`, `WaitlistStatus`), the schema uses **PostgreSQL native enums** rather than string columns. This gives type safety at the database layer (an invalid enum value is rejected by Postgres, not just by the application).

- `UserRole` → `enum { USER, OPERATOR, PACKAGER, ADMIN }`
- `UserStatus` → `enum { WAITLISTED, ACTIVE, DISABLED }`
- `TenantKind` → mirrors the `Tenant.kind` union in `types.ts` (`INDIVIDUAL | HOUSEHOLD | SMALL_BUSINESS | ENTERPRISE | PROFESSIONAL_ORG | GOVERNMENT | EMBEDDED`)
- `AuditSeverity` → `enum { INFO, WARN, ERROR, CRITICAL }` (mirrors `AuditEvent.severity`)
- `TruthLevel` → `enum { T0, T1, T2, T3, T4, T5 }` (mirrors `TruthLevel` in `types.ts`)
- `PackageCategory` → `enum { JURISDICTION, DOMAIN, SITUATION, CAPABILITY }` (mirrors `PackageCategory` in `types.ts`)
- `JurisdictionKind` → mirrors the 11-value union in `types.ts`
- `WaitlistStatus` → `enum { PENDING, APPROVED, REJECTED }` (new — auth sprint, see ADR 0008)

### Structured data columns

Where the kernel exposes a free-form structured value (`Fact.value: unknown`, `AuditEvent.payload: Record<string, unknown>`, `PackageManifest.verificationMetadata`, etc.), the schema uses **PostgreSQL `Json` columns**. This preserves the structured shape while remaining schema-flexible for additive evolution (per I14).

### Connection configuration

- `DATABASE_URL` — the pooled connection string (used by the runtime; routed through Neon's connection pooler to survive serverless cold-starts)
- `DIRECT_URL` — the direct connection string (used by `prisma migrate` for DDL, which cannot run through the pooler)

The Prisma `datasource` block declares both. Migrations are run by an operator with DB access (per ADR 0010 — no remote seeding endpoint); the runtime only ever uses the pooled URL.

## Alternatives considered

- **PlanetScale (MySQL).** Rejected: PlanetScale's branching model is excellent for deploy-preview workflows but their free-tier deprecation and forced upgrade path made the choice brittle for a hardening sprint. MySQL enums are also less strict than Postgres enums (MySQL enums are case-insensitive strings; the platform's enums are case-sensitive SCREAMING_SNAKE_CASE).
- **Supabase (Postgres).** Rejected as a default stack choice: Supabase ships a full auth/realtime/storage layer that overlaps with the platform's own kernel/auth contracts and would compete with NextAuth (ADR 0007). Neon is "just Postgres" — no opinionated framework forced on top.
- **Turso (libSQL).** Rejected: libSQL is the SQLite fork; while it solves the "networked SQLite" problem, it lacks native enums and Json column types that match Prisma's first-class Postgres support. The migration cost from SQLite to libSQL is also non-trivial vs the SQLite → Postgres path that Prisma smooths.
- **Stay on SQLite with a persistent volume.** Rejected: Vercel serverless does not expose persistent volumes in the way that platforms like Fly.io or Render do. Mounting an EFS-style volume is not part of the Vercel model. This would force a different deployment platform.
- **Use Prisma's `sqlite` adapter in-memory + S3 for persistence.** Rejected: serialising the entire database to S3 on every write is absurd at any scale and defeats the purpose of having a relational database.

## Consequences

- The Prisma schema targets Postgres; the local development workflow uses a local Postgres instance (or a Neon branch) rather than a local SQLite file.
- Migrations must be run via `DIRECT_URL` (DDL cannot go through the Neon pooler); the runtime uses `DATABASE_URL` (the pooled URL).
- Native enums give us type safety at the DB boundary: an attempt to write a `UserRole` of `'SUPERUSER'` is rejected by Postgres, not just by application code.
- `Json` columns preserve the structured shape of `Fact.value`, `AuditEvent.payload`, etc. without forcing a schema migration for every additive change (per I14).
- The kernel primitives in `src/kernel/primitives/types.ts` are unchanged — the schema maps to them, not the reverse. The TypeScript types remain the authoritative contract surface.
- All existing kernel models are preserved; new auth models (`User`, `WaitlistEntry`, `Account`, `Session`, `VerificationToken` — see ADR 0007, ADR 0008) are added as new tables, not as modifications to kernel primitives.

## Invariants affected

- **None directly.** This ADR is a data-layer decision. The kernel primitives, the rule/state/decision engines, and the invariants I1–I18 are unchanged.
- **I9** (tenant isolation) is *strengthened* in practice: Postgres row-level policies and the `tenantId` column on every persisted primitive give us a second enforcement layer. But the invariant itself is unaffected — it was already binding.
- **I14** (backward-compatible contracts) is honoured: the Prisma schema migrations are additive (new tables, new columns are nullable or have defaults). No existing field is renamed or removed.
- **I18** (hardening sprint may not redefine architecture): the kernel architecture is unchanged. This ADR records a deployment-time decision, not an architectural change.

## Migration implications

- The `datasource` block in `prisma/schema.prisma` switches from `sqlite` to `postgresql`. The first migration against Postgres creates the full schema (kernel tables + auth tables).
- Existing fixtures (`fixtures/border-crossing-golden-01.json`) are JSON files and are unaffected — they exercise the in-memory engines, not the DB.
- The `architecture-tests/` directory (section 34) runs against the kernel; it is unaffected by the storage choice. Postgres-specific tests (if any) are run by the auth sprint's test suite, not by the architecture tests.
- Future revisions to the storage layer (e.g., a read-replica for audit queries, a separate analytics warehouse) supersede this ADR rather than overwrite it; old ADRs are kept (section 36).
- A future v2 that introduces a different storage abstraction (e.g., a domain-event store instead of a relational mapping) must declare a compatibility strategy, migration strategy, rollback strategy, affected packages, affected APIs, and testing requirements per the ACO process (section 46).

## References

- `constitution.md` — section 3 (kernel primitives), section 24 (multi-tenancy), section 25 (security).
- `contracts/audit.md` — `AuditEvent` persistence on the audit trail.
- `contracts/tenant.md` — `Tenant` persistence on the tenant subsystem.
- `contracts/fact.md` — `Fact` persistence; `value: unknown` mapped to Postgres `Json`.
- `decisions/0007-nextauth-credentials.md` — the auth models that ride on this Postgres schema.
- `decisions/0008-waitlist-approval-flow.md` — the waitlist/auth models that ride on this Postgres schema.
- `decisions/0010-no-seed-endpoint.md` — the seeding policy that depends on having an operator DB URL.
- `src/kernel/primitives/types.ts` — authoritative primitive surface (unchanged by this ADR).
