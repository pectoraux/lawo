# ADR 0013 — Decision Integrity Separation (DecisionRequest vs DecisionRecord)

- **Status:** ACCEPTED
- **Date:** Authorization sprint (post-0011)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The kernel defines a `DecisionRecord` as the authoritative output of the `DecisionEngine` (see `contracts/decision.md` and `src/kernel/primitives/types.ts`):

```
DecisionRecord = {
  decisionId, subjectId, situationId, asOf, computedAt,
  truthLevel, state, provenance[]
}
```

Every field on this record is **authoritative** — it is the engine's verdict, not the client's input. `truthLevel` is the engine's confidence classification (T0–T5, per ADR 0003). `provenance` is the chain of rules, facts, and authorities that justify the verdict (per I6). `state` is the `StateSnapshot` the engine computed (per `contracts/state.md`). `computedAt` is the engine's timestamp. These fields are the kernel's *answer* to the client's *question*.

The previous `/api/decisions` route handler **accepted all of these fields from the client** via `POST`. The handler read `body.truthLevel`, `body.provenance`, `body.state`, `body.computedAt`, and wrote them directly into the database:

```ts
// PRE-0013 /api/decisions/route.ts (POST — REMOVED)
await db.decisionRecord.create({
  data: {
    decisionId: body.decisionId,
    subjectId: body.subjectId,
    truthLevel: body.truthLevel,        // ← CLIENT-FORGEABLE
    provenance: body.provenance,         // ← CLIENT-FORGEABLE
    state: body.state,                   // ← CLIENT-FORGEABLE
    computedAt: body.computedAt,         // ← CLIENT-FORGEABLE
    ...
  },
});
```

This is a **provenance forgery**. An authenticated user could POST a decision with:

- `truthLevel: 'T0'` (authoritative) for a verdict that was never actually computed by the engine. The T0 label would then appear in the audit trail and in any downstream consumer as if the engine had classified the decision as authoritative.
- `provenance: []` (empty) or `provenance: [fabricatedEntry]`. I6 requires that every material decision have provenance; the previous handler let the client supply an empty or fabricated provenance, defeating I6 at the API layer.
- `state: { ... }` with arbitrary `firedEffects` that the engine never computed.

The bug was not a missing authentication (ADR 0007 + 0011 closed that) — it was a missing *integrity* boundary. The handler trusted the client to author the authoritative fields. This violates I5 (LLM non-authoritative — extends to "client non-authoritative" — authoritative fields come from deterministic server machinery) and I6 (provenance integrity — provenance is always server-generated).

This ADR records the architectural decision that closes the gap. The runtime tests that enforce it are INTEGRITY-001 through INTEGRITY-003 in `tests/runtime-security/run.ts` (see `architecture-tests/CATEGORIES.md`).

## Decision

**Separate `DecisionRequest` (client input) from `DecisionRecord` (server-authored authoritative output). The client can request evaluation via `POST /api/state` with a `DecisionRequest`; the server runs the `DecisionEngine` and produces the `DecisionRecord`. `POST /api/decisions` is REMOVED — the client can no longer POST a pre-built decision.**

### `DecisionRequest` (client → server)

The client sends only the *question*, never the *answer*:

```ts
interface StateRequestBody /* = DecisionRequest */ {
  subjectId: string;
  asOf: string;                  // ISO date — "evaluate as of when?"
  situationId?: string;
  facts: Fact[];                  // input facts (the client observes these)
  jurisdictionIds: string[];
  objective?: string;
  persist?: boolean;              // if true, persist the resulting DecisionRecord
}
```

Notably ABSENT from the request body:

- `decisionId` — server-generated.
- `truthLevel` — engine-generated.
- `provenance` — engine-generated.
- `state` — engine-generated.
- `computedAt` — engine-generated.
- `tenantId` — derived from the authenticated session (per ADR 0012), never from the body.

The request body type does not declare these fields. Even if a malicious client adds them to the JSON, the handler ignores them — it reads only the documented `DecisionRequest` fields.

### `DecisionRecord` (server → database → client)

The `DecisionEngine.decide(contextRequest, registry)` call returns `{ state, provenance, audit }`:

- `state: StateSnapshot` — includes `truthLevel`, `firedEffects`, `computedAt`, `provenance[]`.
- `provenance: Provenance[]` — the chain of rules, facts, and authorities.
- `audit: AuditEvent[]` — events emitted during the decision.

If `body.persist === true` AND `state.firedEffects.length > 0`, the handler writes a `DecisionRecord` to the database:

```ts
await db.decisionRecord.create({
  data: {
    decisionId: result.state.provenance[0]?.decisionId ?? `dec_${Date.now()}`,
    subjectId: body.subjectId,                    // from the REQUEST
    situationId: body.situationId ?? null,         // from the REQUEST
    stateJson: JSON.parse(JSON.stringify(result.state)) as object,        // ENGINE
    provenanceJson: JSON.parse(JSON.stringify(result.provenance)) as object, // ENGINE
    asOf: new Date(body.asOf),                    // from the REQUEST
    computedAt: new Date(result.state.computedAt), // ENGINE
    truthLevel: result.state.truthLevel,           // ENGINE
    tenantId: user.tenantId,                       // SESSION (ADR 0012)
  },
});
```

Every authoritative field (`stateJson`, `provenanceJson`, `computedAt`, `truthLevel`) comes from `result` — the engine's output. The request supplies only `subjectId`, `situationId`, `asOf`, and the `tenantId` comes from the session. The client cannot inject any of the authoritative fields.

### `POST /api/decisions` is removed

The previous `POST /api/decisions` handler is **deleted** (not disabled — deleted). The file `src/app/api/decisions/route.ts` exports only `GET`. There is no `export async function POST` in the file. A `POST /api/decisions` request returns 405 Method Not Allowed (Next.js's default response for an unexported method).

`GET /api/decisions` remains — it returns decision records scoped to the authenticated user's tenant (per ADR 0012). The client can read prior decisions; it cannot author them.

### Why `POST /api/state` is the only persist path

`POST /api/state` is the primary endpoint (see the route's header comment). It runs the full pipeline (`ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder → AuditLog`) and returns the result to the client. With `persist: true`, it also writes the `DecisionRecord` server-side.

This makes the persist path identical to the compute path — the client cannot "compute elsewhere and then ask the server to store the result". The server is the only thing that ever computes a `DecisionRecord`. The client only asks for one.

### Determinism

The pipeline is deterministic modulo informational timestamps (per I5, I6, I13): given the same `ContextRequest` and the same package versions, the engine produces the same `truthLevel`, the same `provenance`, and the same `firedEffects`. `computedAt` differs run-to-run (it's the wall-clock time of the computation); `decisionId` is derived from the engine's run. These are informational; the *verdict* is deterministic.

## Alternatives considered

- **Sign the client-provided state with an HMAC.** Rejected: still trusts client computation. The server would verify "this decision was computed by someone who knew the secret" — but that someone could be the client themselves (the secret would have to be shipped to the client to be useful, which makes it not a secret). Signing solves tampering-in-transit, not tampering-at-source. The right answer is for the server to compute the decision itself.
- **Accept client state but re-verify server-side.** Rejected: redundant. If the server re-runs the engine to verify the client's state, the server might as well return its own computed state — the client's input is discarded either way. And if the server only verifies *part* of the client's state (e.g., `truthLevel` but not `provenance`), the unverified part remains forgeable. The decision is to compute fully server-side; partial verification is the worst of both options.
- **Keep `POST /api/decisions` but ignore the authoritative fields.** Rejected: confusing API surface. A handler that accepts fields it ignores is worse than one that does not accept them — a future maintainer might un-ignore them. The handler is removed entirely.
- **Require a server-side "computation token" to call `POST /api/decisions`.** Rejected: the token would have to be issued by a server-side computation, which means the server already computed the decision — there is no reason to round-trip it through the client. The token adds a state-management burden without adding security.
- **Move the persist step into the engine itself.** Considered: the `DecisionEngine` could call `db.decisionRecord.create` directly. Rejected: the engine is in `src/intelligence/decision/` and is currently kernel-adjacent (it must not import `@/lib/db` — see the kernel-imports rules). The persist step belongs in the API route, which is the correct architectural layer for database writes. The engine returns the data; the route persists it.

## Consequences

- **The client cannot forge `truthLevel` or `provenance`.** A `DecisionRecord` in the database is always the engine's verdict, never the client's input. The audit trail (which references `decisionId`s) is correspondingly trustworthy.
- **`POST /api/decisions` returns 405.** Any client that was previously using `POST /api/decisions` to write decisions must migrate to `POST /api/state` with `persist: true`. The request body changes: the client sends a `DecisionRequest` (no `truthLevel`, no `provenance`, no `state`, no `computedAt`). The response shape is the engine's `{ state, provenance, audit }`, which contains the same fields the client previously had to supply.
- **The persisted `DecisionRecord.tenantId` is the session's `tenantId`.** This is enforced by ADR 0012 — the body does not declare a `tenantId` field, and the handler writes `user.tenantId` into the record.
- **`GET /api/decisions` is unchanged.** The read path was already correct under ADR 0012 (tenant-filtered, subjectId AND-scoped). The write path is what changed.
- **The static architecture test `provenance-on-decisions` (I6) still passes.** It verifies the engine attaches `provenance` to `state.provenance` — which is now the *only* way `provenance` enters a `DecisionRecord`. The runtime tests INTEGRITY-001 through INTEGRITY-003 add a *behavioral* check that the client cannot supply these fields.
- **The runtime test INTEGRITY-001** verifies that a `POST /api/decisions` request returns 405 (or 404, depending on the routing). **INTEGRITY-002** verifies that a `POST /api/state` request with extra fields (`truthLevel`, `provenance`) in the body is ignored — the persisted record reflects the engine's computation, not the client's input. **INTEGRITY-003** verifies that the persisted `provenance` is non-empty (the engine always attaches at least one `Provenance` entry when `firedEffects.length > 0`).
- **Future maintainers cannot re-add `POST /api/decisions`.** The runtime test INTEGRITY-001 fails if the handler exists. Re-adding it requires superseding this ADR (per section 36).

## Invariants affected

- **I5** (LLM non-authoritative) — extends to **"client non-authoritative"**. Authoritative fields (`truthLevel`, `provenance`, `state`, `computedAt`) come from deterministic server machinery, never from the client. The invariant's text ("LLMs hallucinate") is unchanged, but the principle it embodies (authoritative answers come from inspectable server machinery) is generalized to cover the client.
- **I6** (provenance integrity) — `provenance` is always server-generated. The previous `POST /api/decisions` allowed `provenance: []` (violating I6) or `provenance: [fabricated]` (forging I6). Both are now impossible: the engine always attaches a non-empty `provenance` when `firedEffects.length > 0`, and the client cannot supply one.
- **I9** (tenant data isolation) — strengthened in practice: the persisted `DecisionRecord.tenantId` is `user.tenantId`, never `body.tenantId`. This prevents the client from polluting another tenant's decision history.
- **I13** (historical decisions remain reproducible) — strengthened in practice: a `DecisionRecord` in the database is always the engine's output for a given `ContextRequest`, so replaying the `ContextRequest` through the same package versions reproduces the stored `state` and `provenance`. (The client could previously store a `state` that the engine would never produce — breaking replay.)
- **I18** — this ADR is an authorization-sprint decision; the kernel architecture is unchanged. The `DecisionRecord` type is unchanged; the `DecisionEngine` is unchanged; only the API surface (`POST /api/decisions` removed, `POST /api/state` with `persist: true` is the only persist path) changed.

## Migration implications

- `src/app/api/decisions/route.ts` — the `POST` handler is **removed**. The file exports only `GET`. The file's header comment explains why POST is absent (it points to this ADR).
- `src/app/api/state/route.ts` — the `POST` handler is updated to write the `DecisionRecord` server-side when `body.persist === true`. The handler reads only `DecisionRequest` fields from the body; extra fields (e.g., `truthLevel`, `provenance`, `tenantId`) in the JSON are silently ignored (TypeScript does not enforce "no extra fields" at runtime, but the handler never reads them).
- The `StateRequestBody` type (in `src/app/api/state/route.ts`) does not declare `truthLevel`, `provenance`, `state`, `computedAt`, or `tenantId`. Adding any of these to the type requires superseding this ADR.
- The runtime tests INTEGRITY-001 through INTEGRITY-003 are added in a parallel task. They are required to pass before a PR touching `src/app/api/`, `src/lib/auth/`, or `src/platform/` is mergeable (see `architecture-tests/CATEGORIES.md`).
- Existing `DecisionRecord` rows in the database (if any) are unaffected — they remain readable via `GET /api/decisions`. The migration does not rewrite historical rows.
- Future revisions (e.g., adding a "draft decision" concept that the client can author at lower confidence) supersede this ADR rather than overwrite it (section 36). A draft concept would require an explicit `isDraft: true` flag and a separate non-authoritative table — it cannot reuse the `DecisionRecord` table.

## References

- `constitution.md` — section 14 (decision engine), section 25 (security), section 31 (I5, I6).
- `contracts/decision.md` — the `DecisionEngine` contract; the `DecisionRecord` shape.
- `contracts/state.md` — the `StateSnapshot` shape (the `state` field on a `DecisionRecord`).
- `contracts/audit.md` — the `AuditEvent` chain that records `decision.compute` and `decision.persist`.
- `architecture/invariants.md` — I5 (LLM non-authoritative → client non-authoritative), I6 (provenance integrity), I9 (tenant data isolation), I13 (historical reproducibility).
- `architecture/architecture-tests/CATEGORIES.md` — the runtime test suite that enforces this ADR (INTEGRITY-001 through INTEGRITY-003).
- `decisions/0003-truth-model.md` — the T0–T5 truth model that `truthLevel` is drawn from.
- `decisions/0012-tenant-authorization-boundary.md` — the companion ADR for tenant scoping (the `tenantId` written into the persisted record is `user.tenantId`).
- `decisions/0014-audit-durability-policy.md` — the `decision.persist` audit event is recorded best-effort (informational); the engine's `decision.compute` event is also best-effort.
- `src/app/api/decisions/route.ts` — GET only; POST intentionally absent (comment cites this ADR).
- `src/app/api/state/route.ts` — the `POST` handler that runs the engine and persists the `DecisionRecord` server-side.
- `src/intelligence/decision/DecisionEngine.ts` — the engine that produces `state`, `provenance`, `audit`.
