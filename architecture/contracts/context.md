# Contract — Context (ContextBuilder)

> Family: UNDERSTAND.
> Implementation surface: `src/intelligence/context/ContextBuilder.ts` (see kernel primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `ContextBuilder` resolves a raw `ContextRequest` (subject, location, time, situation, facts, jurisdictions, objective, tenant) into a fully-resolved `ContextBundle` that downstream engines (rule, state, decision) can consume deterministically. It is the boundary between "untrusted user input" and "deterministic machine state".

The builder must be domain-agnostic: it has no knowledge of insurance, customs, healthcare, etc. (per I1, I3).

## Inputs

A `ContextRequest` containing:

- `subjectId` — the entity being evaluated
- `locationId?` — optional place identifier
- `asOf` — ISO date; the temporal anchor for all resolution (per I7)
- `situationId?` — optional situation identifier (per I4)
- `facts` — `Fact[]` carrying `truthLevel`, `source`, `observedAt`, `tenantId`, optional `jurisdictionId`
- `jurisdictionIds` — the seed jurisdictions (country, region, etc.)
- `objective?` — free-text objective, used only for ranking, not for legal determination
- `tenantId` — isolation scope (per I9)

Plus a `PackageRegistry` to resolve jurisdictions, authorities, sources, rules, and evidence.

## Outputs

A `ContextBundle` containing:

- `request` — the original `ContextRequest`
- `resolvedJurisdictions` — `Jurisdiction[]` expanded from the seed via the jurisdiction graph (ancestors, descendants, applicable-for-date)
- `resolvedAuthorities` — `Authority[]` derived from the resolved jurisdictions
- `applicableRules` — `Rule[]` filtered to those whose `temporal` range covers `asOf` and whose jurisdiction applies
- `evidence` — `Evidence[]` associated with the supplied facts
- `sources` — `Source[]` cited by the rules and facts

## Errors

- `InvalidContextError` — missing `subjectId`, missing `asOf`, or unknown jurisdiction id
- `TenantBoundaryError` — attempting to read facts outside the caller's tenant scope without an explicit publish (per I9)
- `TemporalRangeError` — `asOf` precedes earliest known `validFrom` for a required jurisdiction

Errors are structured (`{ code, message, context }`) and never raise silent exceptions.

## Versioning

The contract surface (input/output shapes) is versioned. Additive changes (new optional fields) are allowed. Renames or removals require a new major version and an ACO. The bundle schema is tied to the kernel version that produced it.

## Security

- The builder MUST enforce tenant isolation: it never reads facts from other tenants without an explicit publish.
- Inputs are untrusted: facts supplied by the user are subject to truth-level tagging (T3 or worse unless sourced from an authoritative source).
- Objective text never influences legal determination (per I5).

## Provenance

The bundle itself is not a decision, so it does not carry `Provenance`. It does carry `sources`, which downstream engines use to construct provenance. Every `Fact` referenced by the bundle retains its `source` and `truthLevel` so downstream provenance is reconstructable (per I6).

## Idempotency

`build(request, registry)` is a pure function of `(request, registry)`. Calling it twice with the same inputs produces identical output. There is no internal mutation, no hidden state, no clock dependency other than the `asOf` value supplied.

## Failure Semantics

- On partial failure (e.g., one unknown jurisdiction id), the builder either returns a structured `InvalidContextError` or — when the caller requested lenient mode — returns a bundle annotated with skipped items. It never silently drops jurisdictions.
- If the registry is empty, the builder returns an empty bundle rather than an error, so that the rule engine can deterministically produce "no rules fired".

## Invariants Enforced

- **I1** — builder is domain-agnostic.
- **I7** — uses `asOf` for all temporal filtering.
- **I9** — enforces tenant boundaries on fact reads.
- **I6** — preserves source metadata for downstream provenance.
- **I14** — public contract preserved across releases unless versioned.
