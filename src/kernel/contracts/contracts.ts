/**
 * Nomos — Kernel Contracts  (architecture §35)
 * --------------------------------------------------
 * Every major subsystem has an explicit, frozen contract. Contracts specify
 * inputs, outputs, errors, versioning, security, provenance, idempotency, and
 * failure semantics. See architecture/contracts/*.md for prose.
 *
 * This module is the single import surface for engine interfaces.
 * Implementations live in their respective subsystem directories.
 */

import type {
  Action,
  Authority,
  ContextBundle,
  ContextRequest,
  Evidence,
  Fact,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Procedure,
  Provenance,
  Rule,
  RuleEvaluationResult,
  Situation,
  SituationState,
  Source,
  StateSnapshot,
  TruthLevel,
  AuditEvent,
} from '@/kernel/primitives/types';

// ============================================================================
// Jurisdiction Graph  (architecture/contracts/rule.md §, contracts/state.md)
// ============================================================================
export interface JurisdictionGraph {
  add(j: Jurisdiction): void;
  addEdge(e: JurisdictionEdge): void;
  get(id: string): Jurisdiction | undefined;
  /** APPLIES_TO / DERIVES_FROM upward traversal. */
  ancestors(id: string): Jurisdiction[];
  descendants(id: string): Jurisdiction[];
  /** Jurisdictions whose temporal range covers asOf and are reachable from the given ids. */
  applicableFor(jurisdictionIds: string[], asOf: string): Jurisdiction[];
  relations(id: string): JurisdictionEdge[];
  all(): Jurisdiction[];
  allEdges(): JurisdictionEdge[];
}

// ============================================================================
// Rule Engine  (architecture/contracts/rule.md) — DETERMINISTIC (I5)
// ============================================================================
export interface RuleEngine {
  /** Pure evaluation of a single rule against facts as of a date. Never calls an LLM. */
  evaluate(rule: Rule, facts: Fact[], asOf: string): RuleEvaluationResult;
  evaluateAll(rules: Rule[], facts: Fact[], asOf: string): RuleEvaluationResult[];
}

// Re-exported from the primitives module so callers don't need to know where it lives.
export type { RuleEvaluationResult } from '@/kernel/primitives/types';

// ============================================================================
// State Engine  (architecture/contracts/state.md)
// ============================================================================
export interface StateEngine {
  compute(
    bundle: ContextBundle,
    situation: Situation | undefined,
    rules: Rule[],
    ruleEngine: RuleEngine,
  ): StateSnapshot;
}

// ============================================================================
// Provenance Builder  (architecture/contracts/decision.md) — I6, I13
// ============================================================================
export interface ProvenanceBuilder {
  build(
    decisionId: string,
    ruleEvaluations: RuleEvaluationResult[],
    rules: Rule[],
    bundle: ContextBundle,
    asOf: string,
    truthLevel: TruthLevel,
  ): Provenance[];
}

// ============================================================================
// Context Builder  (architecture/contracts/context.md) — UNDERSTAND family
// ============================================================================
export interface ContextBuilder {
  build(request: ContextRequest, registry: PackageRegistry): ContextBundle;
}

// ============================================================================
// Decision Engine  (architecture/contracts/decision.md) — orchestrator
// ============================================================================
export interface DecisionEngine {
  decide(
    request: ContextRequest,
    registry: PackageRegistry,
  ): { state: StateSnapshot; provenance: Provenance[]; audit: AuditEvent[] };
}

// ============================================================================
// Procedure Engine  (architecture/contracts/procedure.md)
// ============================================================================
export interface ProcedureEngine {
  currentStep(procedure: Procedure, currentState: string): import('@/kernel/primitives/types').ProcedureStep | undefined;
  nextStep(procedure: Procedure, currentState: string, event: string): import('@/kernel/primitives/types').ProcedureStep | undefined;
}

// ============================================================================
// Situation Engine  (architecture/contracts/state.md, situation packs §7)
// ============================================================================
export interface SituationEngine {
  initial(situation: Situation): SituationState;
  transition(situation: Situation, currentState: string, event: string, facts: Fact[]): SituationState;
  isTerminal(situation: Situation, stateId: string): boolean;
}

// ============================================================================
// Package Registry  (architecture/contracts/package.md)
// ============================================================================
export interface PackageRegistry {
  listPackages(category?: PackageManifest['category']): PackageManifest[];
  getPackage(packageId: string): PackageManifest | undefined;
  listRules(packageId?: string): Rule[];
  listSituations(packageId?: string): Situation[];
  listProcedures(situationId?: string): Procedure[];
  listActions(packageId?: string): Action[];
  listJurisdictions(packageId?: string): Jurisdiction[];
  listAuthorities(packageId?: string): Authority[];
  listSources(packageId?: string): Source[];
  listEvidence(): Evidence[];
  jurisdictionGraph: JurisdictionGraph;
}

// ============================================================================
// Audit Log  (architecture/contracts/audit.md)
// ============================================================================
export interface AuditLog {
  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  recent(tenantId: string | null, limit?: number): Promise<AuditEvent[]>;
  forSubject(subjectId: string, limit?: number): Promise<AuditEvent[]>;
}
