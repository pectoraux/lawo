# ADR 0003 — Truth Model (T0–T5) and Rule Types

- **Status:** ACCEPTED
- **Date:** Initial constitution
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Section 13 mandates a conceptual hierarchy of truth/confidence levels (T0–T5) that must be preserved end-to-end across storage, retrieval, reasoning, UI, API, and audit logs. Section 12 mandates four explicit rule types and forbids silently collapsing discretionary or predictive judgments into deterministic legal facts. Every decision must expose its epistemic status.

Section 17 adds an observational/community layer with statuses `OFFICIAL`, `VERIFIED`, `COMMUNITY_REPORTED`, `UNVERIFIED`, `PREDICTED` that must remain distinct from authoritative knowledge.

Without a shared truth model the platform could (a) present community observations as enacted law, (b) present predictions as facts, or (c) present interpretations as enacted text. Each is unacceptable for an authoritative rules-and-reality OS. A user told "you must pay USD 500" needs to know whether that obligation comes from enacted law (T0), a derived calculation (T1), an established interpretation (T2), an expert opinion (T3), a community report (T4), or a forecast (T5).

## Decision

Adopt the T0–T5 truth/confidence hierarchy:

| Level | Meaning | Example |
| --- | --- | --- |
| T0 | authoritative | Enacted statute, treaty article, regulation |
| T1 | deterministically derived | A fee computed from a T0 rule and T0 facts |
| T2 | established interpretation | A regulator's long-standing guidance |
| T3 | expert interpretation | A lawyer's reading; an LLM-extracted fact (capped) |
| T4 | community observation | A traveler's report of a border-post fee |
| T5 | prediction | A forecast of next month's processing time |

Adopt the four rule types:

- `DETERMINISTIC` — conditions fully determine the effect; truth level T0 or T1.
- `CONDITIONAL` — applies when condition predicates are satisfied; truth level T1 or T2.
- `DISCRETIONARY` / `INTERPRETIVE` — involves judgment; truth level T2 or T3.
- `PREDICTIVE` — forecasted; truth level T5.

### Hard rules

- A `Rule`'s `truthLevel` flows through to every `FiredEffect` in the `StateSnapshot`.
- The cumulative snapshot `truthLevel` is the weakest link among fired rules (highest numeric level wins for "weakest").
- The system **never** silently promotes T3+ to T0/T1; **never** represents community reports (T4) as law; **never** represents predictions (T5) as facts; **never** represents an interpretation (T2/T3) as enacted text (per I8).
- The UI surfaces the truth level on every material conclusion. Users can tell "the law requires this" from "an expert thinks this" from "the community has reported this".
- LLM-extracted facts are capped at T3 (expert interpretation); they cannot be stored at T0 or T1 (per I5).
- Audit logs include `truthLevel` for every material event so historical decisions remain epistemically reconstructable (per I13).

## Alternatives considered

- **Single confidence scalar (0.0–1.0).** Rejected: collapses distinct epistemic categories; cannot distinguish authoritative law from community report. Provides false precision; doesn't survive a join (you cannot "average" a T0 statute with a T4 community report).
- **Three-level "high/medium/low".** Rejected: not expressive enough to distinguish authoritative vs deterministically derived vs established interpretation. The platform's decisions span the full epistemic range; three buckets lose material distinctions.
- **LLM-asserted confidence.** Rejected (per I5): LLMs cannot be the source of authoritative truth labels. LLMs may extract candidate facts (capped at T3) but cannot assert T0/T1 truth.
- **Collapsing rule types into one.** Rejected (section 12): the system must expose epistemic status per decision. A `DISCRETIONARY` rule's effect must not be indistinguishable from a `DETERMINISTIC` one.
- **Storing observation status as a truth level.** Rejected: observation status and truth level are orthogonal. A `COMMUNITY_REPORTED` observation may carry T4 truth; an `OFFICIAL` observation may carry T0. Both fields are required.

## Consequences

- `truthLevel` is required on `Rule`, `Fact`, `FiredEffect`, and `StateSnapshot` and is preserved end-to-end across storage, retrieval, reasoning, UI, API, and audit logs (per I8, I13).
- `ObservationStatus` is preserved for the observational/community layer (section 17); community observations carry T4 and never produce authoritative obligations (per I8).
- The UI renders a truth-level badge on every material conclusion; users can tell apart authoritative law from interpretation from community report.
- Audit logs include `truthLevel` for every material event; an audit replay can reconstruct "what was authoritative when this decision was made".
- The cumulative snapshot `truthLevel` (weakest link) prevents a community observation from contaminating an authoritative decision.
- The truth-level helpers, badges, and colors live in `src/kernel/truth/truth.ts` (see worklog "Source Layout").

## Invariants affected

- **I5** — LLM output never authoritative; LLM-extracted facts capped at T3.
- **I6** — provenance preserves `truthLevel` for every fired rule.
- **I8** — community observations (T4) cannot masquerade as authority (T0/T1).
- **I13** — truth levels preserved across historical replays so old decisions remain epistemically reconstructable.
- **I14** — truth model preserved across releases unless versioned.
- **I16** — no new truth level (e.g., T6) without an ACO.

## Migration implications

- At adoption there is no prior truth model. All rules, facts, and decisions henceforth carry `truthLevel`.
- Existing data (if any) must be backfilled with an explicit truth level during migration; data with unknown provenance is treated as T3 at best, never T0/T1.
- Future changes to the hierarchy (e.g., adding T6) require an ACO; they cannot be slipped in as part of a feature sprint (per I18).
- The architecture test suite (section 34) verifies that no `Rule` carries `truthLevel: 'T4'` or `'T5'`, and that no `Fact` with `truthLevel: 'T4'` or `'T5'` is referenced as authoritative by a `Rule` at `truthLevel: 'T0'`/`'T1'`.

## References

- `constitution.md` — section 13 (truth model), section 12 (rule types), section 17 (observational layer).
- `contracts/rule.md`, `contracts/state.md`, `contracts/decision.md` — truth level preservation across engines.
- `decisions/0002-ruleir-v1.md` — `RuleIR` carries `truthLevel` from parent `Rule` to `RuleEffect` to `FiredEffect`.
- Source specification sections 12, 13, 17.
