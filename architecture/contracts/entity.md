# Contract — Entity (Generic Subject/Actor Primitive)

> Family: Foundation.
> Implementation surface: `src/kernel/primitives/types.ts` (`Entity`); consumed by `ContextBuilder`, `StateEngine`, `RuleEngine`, `DecisionEngine`, and the Evidence pipeline. No dedicated `EntityGraph.ts` — entities are first-class primitives referenced by `subjectId` across the other graphs.
> Status: FROZEN. Changes require an ACO.

## Purpose

The `Entity` primitive is the generic subject or actor in the system (section 3). It is the **thing that facts are about** and the **thing decisions are made for**. An `Entity` is intentionally generic: it can represent a person, a vehicle, a consignment, a parcel of land, a contract, an organisation, or any other subject — without the kernel carrying vertical-specific type knowledge (per I1, I3).

`Entity` is one of the kernel primitives enumerated in section 3 of the constitution. Vertical-specific concepts (`InsuranceClaim`, `ADU`, `HospitalAssistance`, `TrafficStop`, `AfCFTAShipment`) MUST NOT be promoted into the kernel; they are composed as `Entity` rows of an appropriate `type` plus a `Fact[]` set, shipped inside packages.

## Inputs

The `Entity` shape (authoritative: `src/kernel/primitives/types.ts`):

- `id: string` — stable, unique entity id (e.g., `ent:vehicle:GH-1234-AB`)
- `type: string` — generic type discriminator (e.g., `"vehicle"`, `"person"`, `"consignment"`); NOT a vertical-specific class
- `label: string` — human-readable label for UI surfaces
- `tenantId: string | null` — `null` means `GLOBAL` knowledge (per I9); otherwise the owning tenant
- `attributes?: Record<string, unknown>` — optional unstructured attributes; structured facts MUST be stored as `Fact[]`, not in this bag

Engines consume `Entity` via the `subjectId` field on `Fact`, `ContextRequest`, `StateSnapshot`, and `Provenance`. The entity itself is resolved by the `ContextBuilder` when assembling a `ContextBundle`.

## Outputs

`Entity` is a primitive, not an engine — it does not produce computational outputs. It participates in:

- `ContextBundle.request.subjectId` — the entity being evaluated
- `Fact.subjectId` — the entity the fact is observed about
- `StateSnapshot.subjectId` — the entity the snapshot was computed for
- `AuditEvent.subjectId?` — the entity an audited action affected
- `ProvenanceBuilder` cross-references — entities flow through to provenance so historical decisions remain reconstructable (per I6, I13)

## Errors

`Entity` itself is a data primitive; errors are raised by consumers when an entity is misused:

- `UnknownEntityError` — `subjectId` referenced by a fact/request does not resolve to a known `Entity`
- `TenantBoundaryError` — caller attempted to read an `Entity` whose `tenantId` is outside its scope without an explicit publish (per I9)
- `MalformedEntityError` — `id`, `type`, or `label` missing; `type` contains a forbidden vertical token (`InsuranceClaim`, `ADU`, etc.)

Errors are structured (`{ code, message, context }`) and never raise silent exceptions.

## Versioning

- The `Entity` shape is versioned. Additive changes (new optional fields) are allowed. Renames or removals require a new major version and an ACO.
- `Entity.type` is an open string — packages may introduce new types freely without changing the kernel contract. The set of forbidden tokens (the vertical-specific blacklist enforced by I1) is fixed by the constitution.

## Security

- Every `Entity` carries a `tenantId` (`string | null`); cross-tenant reads are refused without an explicit publish (per I9).
- `attributes` is a free-form bag and MUST NOT be used to bypass tenant isolation or store secrets. Sensitive material belongs in `Evidence`/`Document` records with proper access control, not in `attributes`.
- `Entity.type` is validated against the vertical-specific blacklist at load time (per I1, I3) — a kernel primitive named `InsuranceClaim` is rejected.

## Provenance

The `Entity` is the subject axis of provenance. `Fact.subjectId`, `StateSnapshot.subjectId`, and `AuditEvent.subjectId` all reference an `Entity.id` so downstream provenance can answer "what was this decision about?" (per I6). The `tenantId` of the entity is preserved in every cross-reference so historical decisions remain reconstructable across tenant contexts (per I13).

## Idempotency

- Reading the same `Entity` by `id` is a pure function: identical inputs yield identical outputs.
- Creating an entity with the same `id` is idempotent — duplicate inserts of the same `(id, type, label, tenantId)` tuple produce the same record. Conflicting inserts (same `id`, different `type`/`tenantId`) are rejected, not silently overwritten (per I14).

## Failure Semantics

- An unresolved `subjectId` in a request surfaces `UnknownEntityError`; the engine does not fabricate a placeholder entity.
- A vertical-specific `type` (e.g., `"InsuranceClaim"`) is rejected at validation; the engine does not silently accept vertical tokens in the kernel.
- A `tenantId` mismatch between caller and entity surfaces `TenantBoundaryError`; the engine does not fall back to "global".

## Invariants Enforced

- **I1** — `Entity` is domain-agnostic; `type` is an open string but the vertical blacklist is enforced.
- **I3** — vertical-specific concepts cannot be promoted to kernel `Entity` types; they must be composed as packages.
- **I9** — `tenantId` is enforced on every read; cross-tenant reads require explicit publish.
- **I6** — entity id flows through to provenance as the subject axis.
- **I13** — entity identity and tenant scope are preserved across historical replays.
- **I14** — `Entity` contract preserved across releases unless versioned.
- **I16** — no new kernel primitive in place of `Entity` for a feature; compose with `Entity` + `Fact[]` instead.

## References

- `constitution.md` — section 3 (kernel primitives), section 24 (multi-tenancy).
- `contracts/fact.md` — `Fact.subjectId` references an `Entity.id`.
- `contracts/context.md` — `ContextRequest.subjectId` is the entity being evaluated.
- `contracts/state.md` — `StateSnapshot.subjectId` references the evaluated entity.
- `contracts/tenant.md` — tenant isolation rules applied to `Entity.tenantId`.
- `contracts/audit.md` — `AuditEvent.subjectId?` cross-references entities.
- `decisions/0001-initial-architecture.md` — the kernel/package split that places `Entity` in the kernel.
- `src/kernel/primitives/types.ts` — authoritative `Entity` surface.
