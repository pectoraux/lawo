# Nomos — Architecture Test Suite (§34)

> Source: `architecture/constitution.md` section 34, `architecture/invariants.md` I1–I18.

Automated invariant checks that verify the FROZEN architecture of the Nomos
platform is not violated by source code. These are **architecture tests**,
not unit tests — they enforce the boundaries between kernel, packages,
intelligence, and experience layers, plus the security invariants on the API
surface. They must run in CI on every meaningful change.

## Run

```bash
bun run arch-test
# or equivalently:
bun run architecture/architecture-tests/run.ts
```

Exit code:
- `0` — all checks passed.
- `1` — at least one check failed (details printed to stdout).

The script is self-contained: it uses only Node.js built-in modules
(`fs`, `path`, `url`) — no external dependencies. It performs **static
analysis** by reading source files; it does NOT execute the source code.

## Output

```
Nomos — Architecture Test Suite (§34)
=====================================

I1    kernel-imports-no-verticals ........ ✓
I2    kernel-imports-no-verticals ........ ✓
I3    kernel-imports-no-verticals ........ ✓
I5    kernel-imports-no-llm .............. ✓
I6    provenance-on-decisions ............ ✓
I7    temporal-metadata-on-rules ......... ✓
I10   package-dependency-rules ........... ✓
I11   packages-do-not-mutate-kernel ...... ✓
I16   no-feature-specific-hacks-in-kernel .. ✓
AUTHZ privileged-routes-check-authz ...... ✓
SEC   no-secrets-in-client-code .......... ✓
SEC   audit-payload-sanitizer ............ ✓
SEC   no-remote-seeding .................. ✓
SEC   csrf-on-mutations .................. ✓

-------------------------------------
14 passed, 0 failed
(25 ms)
```

On failure, the line shows `✗` and the violations are listed beneath the
table line with file paths and the specific check that failed.

## Checks implemented

| ID    | Check name | What it verifies |
| ----- | ---------- | ---------------- |
| I1    | kernel-imports-no-verticals | Kernel `.ts` files do not import vertical modules, do not reference vertical type names (`InsuranceClaim`, `ADU`, `HospitalAssistance`, `TrafficStop`, `AfCFTAShipment`), and do not branch on vertical predicates (`if (insurance)`, `if (border)`, etc.). Comments and string literals are stripped before the content scan. |
| I2    | kernel-imports-no-verticals | Same scan as I1 — country-specific vertical terms are also rejected. |
| I3    | kernel-imports-no-verticals | Same scan as I1 — vertical-specific terms in import path segments (`insurance`, `border`, `customs`, `zoning`, `healthcare`, `adu`, `afcfta-shipment`, `traffic-stop`) are rejected. |
| I5    | kernel-imports-no-llm | Kernel and intelligence code do not import `z-ai-web-dev-sdk`, do not call `ZAI.create()`, do not call `chat.completions.create`. LLMs may only be used in `src/app/api/` routes (e.g., for extraction), never in the kernel or the decision engine. |
| I6    | provenance-on-decisions | `src/intelligence/decision/DecisionEngine.ts` builds a `provenance` array and assigns it to `state.provenance` (or `s.state.provenance` via immer). Every material decision carries provenance. |
| I7    | temporal-metadata-on-rules | Every `Rule[]` and `Rule`-typed declaration in `src/lib/packages-data/` has a `temporal` block with `validFrom` and `version`. Without this, `evaluate(as_of = DATE)` cannot reconstruct historical truth. |
| I10   | package-dependency-rules | Every `PackageManifest` in `src/lib/packages-data/` declares `dependencies` whose `packageId` references resolve to a manifest that exists in the loaded set. |
| I11   | packages-do-not-mutate-kernel | Files in `src/lib/packages-data/` only `import type { ... } from '@/kernel/...'`. Non-type imports of kernel symbols are rejected — packages compose kernel primitives, they do not mutate them. (By design this also passes because all kernel exports are interfaces/types — runtime mutation is structurally impossible.) |
| I16   | no-feature-specific-hacks-in-kernel | Kernel code does not contain `if (insurance)`, `if (border)`, `if (zoning)`, `if (healthcare)`, `if (customs)`, `if (immigration)` (case-insensitive) nor feature-specific string literals `'insurance'`, `'border'`, `'customs'` in non-comment, non-type-definition lines. |
| AUTHZ | privileged-routes-check-authz | Every POST/PUT/DELETE handler in `src/app/api/` calls `requireAdmin()`, `requireUser()`, `getSession()`, or `checkOrigin()` (for public-but-CSRF-protected routes). Privileged routes (`/api/waitlist/approve`, `/api/waitlist/reject`, `/api/waitlist/pending`, `/api/admin/users`) MUST call `requireAdmin()`. Exceptions: `/api/auth/*` (NextAuth), `/api/waitlist` POST (public, CSRF-protected), `/api/set-password` POST (public, token-protected, CSRF-protected). |
| SEC   | no-secrets-in-client-code | No `'use client'` file in `src/` references `process.env.DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, or `POSTGRES_HOST`. Client code MAY reference `NEXT_PUBLIC_*` env vars. |
| SEC   | audit-payload-sanitizer | `src/lib/auth/audit.ts` contains a payload sanitizer that matches `password`, `token`, `secret`, `hash`, `credential` (case-insensitive) and replaces values with `[REDACTED]`. |
| SEC   | no-remote-seeding | The directory `src/app/api/seed-demo/` does NOT exist. Seeding endpoints are forbidden in production deployments. |
| SEC   | csrf-on-mutations | Every POST handler in `src/app/api/` calls `checkOrigin(req)` (from `@/lib/csrf`), OR is under `/api/auth/` (NextAuth handles CSRF internally), OR is under `/api/me` (GET only, no mutations). |

## Architecture Conflicts

When a check reveals an actual invariant violation in the source code (not a
bug in the test itself), the violation is documented as an `ARCHITECTURE
CONFLICT` in `worklog.md`. The test is NOT modified to make it pass — fixing
the source code is a separate task.

## Performance

The script walks the `src/` tree once per check (each check visits only the
files it needs). End-to-end runtime is typically under 50 ms on a warm
filesystem, well below the 2-second budget.

## Adding a new check

1. Add a new `checkXxx(): CheckResult` function in `run.ts`.
2. Register it in the `checks` array inside `main()`.
3. Run `bun run arch-test` and verify the new check appears in the output.
4. Update this README's check table.
5. Append an entry to `worklog.md` describing the new check.
