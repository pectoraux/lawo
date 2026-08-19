/**
 * Nomos — CompiledRule (Runtime Representation)  (architecture §11, §34)
 * --------------------------------------------------
 * The `CompiledRule` is the executable runtime representation produced by
 * the `RuleCompiler` from a validated `Rule`. It is:
 *
 *   - Pre-validated — the validator already verified the rule is well-formed.
 *   - Normalised — nested `and`/`or` flattened, duplicate children removed.
 *   - Tamper-evident — carries a SHA-256 `hash` of its canonical JSON.
 *   - Traceable — `sourceRuleIrId` identifies the originating `RuleIR.id`.
 *
 * The `RuleEngine` evaluates `CompiledRule`s identically to `Rule`s: the
 * condition tree is structurally the same (modulo normalisation). The benefit
 * is that compiled rules can be cached, hashed, and trusted without
 * re-validating on every call.
 *
 * The `hash` field is REQUIRED and computed by the compiler — it makes the
 * compiled representation immutable after publication (per I10, I13).
 */

import type {
  ConditionNode,
  RuleEffect,
  RuleType,
  TemporalRange,
  TruthLevel,
} from '@/kernel/primitives/types';

/**
 * CompiledRule — the executable runtime representation of a Rule.
 *
 * Identity fields are preserved verbatim from the source `Rule`. The
 * `compiledConditions` / `compiledExceptions` / `effects` fields hold the
 * normalised runtime data. `hash` is the SHA-256 of the canonical JSON of
 * the rest of the object (excluding the `hash` field itself).
 *
 * The `compiledAt` timestamp is informational and NOT included in the hash —
 * it tells operators when the rule was compiled, not what the rule is.
 */
export interface CompiledRule {
  // ----- Identity (preserved from Rule) -----
  /** The canonical Rule.id this was compiled from. */
  id: string;
  /** Human-readable code (e.g., "ECOWAS-FM-ART3"). */
  code: string;
  /** Human-readable title. */
  title: string;
  /** Package id this rule belongs to (matches Rule.packageId). */
  packageId: string;
  /** Rule version — sourced from Rule.temporal.version. */
  ruleVersion: number;

  // ----- Compiled condition tree (normalized — same semantics) -----
  /** Normalised condition tree (flattened and/or, deduped children). */
  compiledConditions: ConditionNode;
  /** Normalised exception trees (one per source RuleIR.exceptions entry). */
  compiledExceptions: ConditionNode[];
  /** Cloned effects array (preserved in source order). */
  effects: RuleEffect[];

  // ----- Metadata (preserved) -----
  jurisdictionId: string;
  authorityId: string;
  sourceId: string;
  type: RuleType;
  truthLevel: TruthLevel;
  temporal: TemporalRange;

  // ----- Provenance — traceable to original RuleIR -----
  /** The RuleIR.id this compiled rule was produced from. */
  sourceRuleIrId: string;
  /** ISO timestamp — when this rule was compiled (informational only). */
  compiledAt: string;

  // ----- Integrity -----
  /** SHA-256 of the canonical JSON of the CompiledRule (minus the hash field). */
  hash: string;
}
