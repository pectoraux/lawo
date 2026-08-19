# Contract — Extension (Extension SDK)

> Family: Foundation.
> Implementation surface: Extension SDK (described in section 22; primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The Extension SDK lets developers extend schemas, data connectors, document processors, rule packs, procedures, actions, agents, UI components, navigation, and institutional integrations. Extensions receive **explicit capabilities** — never unrestricted access (section 22).

An extension must declare exactly what it can: `READ`, `WRITE`, `INVOKE`, `ACT_UPON`.

## Inputs

- An extension manifest declaring:
  - extension id and version
  - the capabilities it requests (`READ`, `WRITE`, `INVOKE`, `ACT_UPON`) and the targets each capability applies to (entities, sources, connectors, actions)
  - the package(s) it extends
  - the resources it requires (e.g., document processors, connectors)
- Runtime calls issued by the extension during execution (e.g., "read fact X", "invoke connector Y", "act upon entity Z").

## Outputs

- A registered extension with its capabilities stored in the runtime
- Results of extension-initiated calls, scoped to declared capabilities
- Audit events recording every privileged call

## Errors

- `CapabilityNotDeclaredError` — extension attempted an action it did not declare
- `CapabilityScopeExceededError` — extension attempted an action outside its declared scope (e.g., reading a different tenant's facts)
- `ExtensionLoadError` — manifest invalid or signature missing
- `ExtensionRuntimeError` — extension raised during execution

Errors are structured and surface the offending extension id.

## Versioning

- The extension manifest schema is versioned; additive changes are allowed, renames/removals require an ACO.
- Extensions declare the package versions they target; mismatched versions are rejected.

## Security

- Deny-by-default: any call not explicitly declared is refused.
- Capabilities are scoped to tenants; cross-tenant access requires explicit, authorized publication (per I9).
- Extensions cannot modify rule packages or authoritative knowledge without authorized workflows (per section 27).

## Provenance

Every privileged call issued by an extension is recorded in the audit log with the extension id, the capability used, the target, and the timestamp. Material decisions produced through extension-assisted flows still produce normal `Provenance` (per I6).

## Idempotency

Extension-issued calls accept an idempotency key (same model as `ActionModel`). Repeating a call with the same key returns the prior result rather than re-executing side effects.

## Failure Semantics

- An extension that attempts an undeclared capability is suspended; its in-flight calls are aborted and the audit log records the violation.
- An extension crash does not crash the platform; the runtime isolates the failure and reports it.
- Side effects produced before a crash are preserved with explicit `PARTIAL` status.

## Invariants Enforced

- **I12** — extensions cannot bypass capability permissions.
- **I6** — privileged calls recorded for provenance.
- **I9** — tenant boundaries enforced.
- **I14** — manifest schema preserved across releases unless versioned.
