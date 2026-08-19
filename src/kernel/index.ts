/**
 * Nomos — Kernel Barrel Export
 * --------------------------------------------------
 * Single import surface for the kernel. Re-exports:
 *
 *   - All types from ./primitives/types
 *   - All engine interfaces from ./contracts/contracts
 *   - All factory functions for engines
 *   - All truth / temporal helpers
 *   - canExecute / applicableActions / evaluateCondition
 *
 * The kernel is DOMAIN-AGNOSTIC (I1). Vertical behavior lives in
 * packages under src/lib/packages-data — never here.
 *
 * Engines are deterministic (I5): same inputs → same outputs (modulo
 * informational ISO timestamps like `producedAt`, `computedAt`, `timestamp`).
 */

// ============================================================================
// Types
// ============================================================================
export * from '@/kernel/primitives/types';

// ============================================================================
// Engine interfaces (contracts)
// ============================================================================
export type {
  JurisdictionGraph,
  RuleEngine,
  StateEngine,
  ProvenanceBuilder,
  ContextBuilder,
  DecisionEngine,
  ProcedureEngine,
  SituationEngine,
  PackageRegistry,
  AuditLog as KernelAuditLog,
} from '@/kernel/contracts/contracts';

// ============================================================================
// Factories
// ============================================================================
export { createJurisdictionGraph } from '@/kernel/jurisdiction/JurisdictionGraph';
export { createRuleEngine } from '@/kernel/rules/RuleEngine';
export { createStateEngine } from '@/kernel/state/StateEngine';
export { createProvenanceBuilder } from '@/kernel/provenance/ProvenanceBuilder';
export { createEvidenceGraph } from '@/kernel/evidence/EvidenceGraph';
export { createContextBuilder } from '@/intelligence/context/ContextBuilder';
export { createDecisionEngine } from '@/intelligence/decision/DecisionEngine';
export { createSituationEngine } from '@/situations/SituationEngine';
export { createProcedureEngine } from '@/procedures/ProcedureEngine';

// ============================================================================
// Truth helpers
// ============================================================================
export {
  TRUTH_LEVELS,
  TRUTH_RANK,
  TRUTH_LABEL,
  TRUTH_DESCRIPTION,
  TRUTH_BADGE,
  combineTruthLevels,
  isAuthoritative,
  isObservational,
} from '@/kernel/truth/truth';

// ============================================================================
// Temporal helpers
// ============================================================================
export {
  covers,
  isoDate,
  isoTimestamp,
  today,
  openRange,
  pickAsOf,
  inEffectAsOf,
} from '@/kernel/time/TemporalModel';

// ============================================================================
// Action model
// ============================================================================
export { canExecute, applicableActions } from '@/kernel/actions/ActionModel';

// ============================================================================
// Condition evaluator (pure)
// ============================================================================
export { evaluateCondition } from '@/kernel/rules/conditionEval';

// ============================================================================
// Evidence graph interface (re-exported so callers don't need a separate import)
// ============================================================================
export type { EvidenceGraph } from '@/kernel/evidence/EvidenceGraph';
