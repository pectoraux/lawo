/**
 * Nomos — Kernel Primitives (FROZEN)
 * --------------------------------------------------
 * Source of truth for the kernel type surface. See:
 *   - architecture/constitution.md (sections 3, 11–17)
 *   - architecture/invariants.md  (I1, I5, I6, I7, I8)
 *
 * The kernel is DOMAIN-AGNOSTIC (I1, I3). It contains NO vertical-specific
 * concepts (no InsuranceClaim, no ADU, no AfCFTAShipment, no TrafficStop).
 * Vertical behavior lives exclusively in packages under src/lib/packages-data.
 *
 * Invariant I5: LLM output is never authoritative legal truth. LLMs may extract
 * facts, retrieve candidate rules, and generate explanations — but authoritative
 * evaluation must run through deterministic rule/decision machinery.
 */

// ============================================================================
// 0. Truth / Confidence Model  (architecture §13)
// ============================================================================
/**
 * T0  authoritative              — enacted text, official source
 * T1  deterministically derived   — produced by rule engine from T0 facts
 * T2  established interpretation  — settled case law / long-standing guidance
 * T3  expert interpretation       — non-binding expert opinion
 * T4  community observation       — observational / community-reported
 * T5  prediction                  — forecasted / modelled, not yet observed
 *
 * I8: Community observations (T4) can never masquerade as authority (T0/T1).
 * I6: Every material decision carries provenance including its truthLevel.
 */
export type TruthLevel = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/** Rule epistemic classification (architecture §12). */
export type RuleType = 'DETERMINISTIC' | 'CONDITIONAL' | 'DISCRETIONARY' | 'PREDICTIVE';

/**
 * Status for observational / community-layer records (architecture §17).
 * OFFICIAL > VERIFIED > COMMUNITY_REPORTED > UNVERIFIED > PREDICTED
 */
export type ObservationStatus =
  | 'OFFICIAL'
  | 'VERIFIED'
  | 'COMMUNITY_REPORTED'
  | 'UNVERIFIED'
  | 'PREDICTED';

// ============================================================================
// 1. Temporal Model  (architecture §15)
// ============================================================================
/**
 * Every rule, source, fact, document, interpretation, and package must carry
 * temporal metadata so the platform can evaluate(as_of = DATE) (I7, I13).
 */
export interface TemporalRange {
  validFrom: string;        // ISO date — inclusive
  validTo?: string | null;  // ISO date — exclusive, or null = open-ended
  publishedAt?: string;     // ISO date — when the artefact was published
  ingestedAt?: string;      // ISO date — when the platform ingested it
  version: number;          // monotonically increasing per artefact id
  supersedes?: string | null;     // id of the previous version this replaces
  supersededBy?: string | null;  // id of the next version, set when superseded
}

// ============================================================================
// 2. Provenance  (architecture §14) — I6, non-negotiable
// ============================================================================
/**
 * Every material conclusion must be reconstructable (I6, I13):
 *
 *   DECISION → RULE → SOURCE → AUTHORITY → VERSION
 *          → FACTS → EVIDENCE → CALCULATION → ASSUMPTIONS
 */
export interface Provenance {
  decisionId: string;
  ruleId: string;
  ruleVersion: number;
  /**
   * The package this rule came from. Populated by ProvenanceBuilder from
   * `Rule.packageId`. Together with `packageVersion`, this identifies the
   * exact package/rule versions used to produce a decision (per RULE-008,
   * I6, I13 — historical reproducibility requires pinning package versions).
   */
  packageId: string;
  /**
   * The exact version of the package the rule came from. Populated by
   * ProvenanceBuilder from the package manifest's `version` field via the
   * `packageVersions` map passed to the builder factory. Falls back to
   * `ruleVersion` (best-effort) when no manifest version is available.
   */
  packageVersion: string;
  source: SourceRef;
  authority: AuthorityRef;
  facts: FactRef[];
  evidence: EvidenceRef[];
  calculation: CalculationStep[];
  assumptions: string[];
  truthLevel: TruthLevel;
  asOf: string;          // ISO date — the evaluate-as_of anchor (I7)
  producedAt: string;    // ISO timestamp — when this provenance was built
}

export interface SourceRef {
  sourceId: string;
  citation: string;
  url?: string;
}

export interface AuthorityRef {
  authorityId: string;
  name: string;
  jurisdictionId: string;
}

export interface FactRef {
  factId: string;
  subjectId: string;
  attribute: string;
  value: unknown;
  truthLevel: TruthLevel;
}

export interface EvidenceRef {
  evidenceId: string;
  documentId?: string;
  page?: number;
  region?: string;
}

export interface CalculationStep {
  description: string;
  input: unknown;
  output: unknown;
  ruleClause?: string;
}

// ============================================================================
// 3. Kernel Primitives  (architecture §3)
// ============================================================================
export interface Entity {
  id: string;
  type: string;             // generic — e.g. "vehicle", "person", "consignment"
  label: string;
  tenantId: string | null;  // null = GLOBAL knowledge (I9)
  attributes?: Record<string, unknown>;
}

/**
 * A fact is a typed observation about a subject at a point in time.
 * Facts carry their truthLevel end-to-end (storage → reasoning → UI → audit).
 * Document-extracted facts MUST retain provenance to source page/region (§16).
 */
export interface Fact {
  id: string;
  subjectId: string;
  attribute: string;
  value: unknown;
  truthLevel: TruthLevel;
  source?: SourceRef;
  observedAt: string;        // ISO date
  tenantId: string | null;    // null = GLOBAL (I9)
  jurisdictionId?: string;
}

// ---- Jurisdiction Graph (architecture §5) ---------------------------------
export type JurisdictionKind =
  | 'COUNTRY'
  | 'REGION'
  | 'STATE'
  | 'MUNICIPALITY'
  | 'REGULATOR'
  | 'COURT'
  | 'SPECIAL_ZONE'
  | 'FREE_ZONE'
  | 'SUPRANATIONAL'
  | 'BILATERAL'
  | 'INTERNATIONAL';

export interface Jurisdiction {
  id: string;
  code: string;              // human code e.g. "GH", "ECOWAS", "AFCFTA"
  name: string;
  kind: JurisdictionKind;
  parentIds: string[];       // APPLIES_TO-style upward links (multi-parent OK)
  temporal: TemporalRange;
}

/** 11 frozen jurisdiction relation types (architecture §5). */
export type JurisdictionRelation =
  | 'APPLIES_TO'
  | 'OVERRIDES'
  | 'PREEMPTS'
  | 'IMPLEMENTS'
  | 'DERIVES_FROM'
  | 'MODIFIES'
  | 'EXEMPTS'
  | 'REFERENCES'
  | 'SUPERSEDES'
  | 'INTERPRETS'
  | 'CONDITIONAL_ON';

export interface JurisdictionEdge {
  fromId: string;
  toId: string;
  relation: JurisdictionRelation;
}

// ---- Authority -------------------------------------------------------------
export type AuthorityKind =
  | 'LEGISLATURE'
  | 'EXECUTIVE'
  | 'JUDICIARY'
  | 'REGULATOR'
  | 'INTERNATIONAL_BODY'
  | 'CUSTOMS'
  | 'IMMIGRATION'
  | 'TAX'
  | 'OTHER';

export interface Authority {
  id: string;
  name: string;
  jurisdictionId: string;
  kind: AuthorityKind;
}

export interface Source {
  id: string;
  title: string;
  citation: string;
  url?: string;
  authorityId: string;
  publishedAt?: string;
}

// ============================================================================
// 4. RuleIR  (architecture §11) — canonical machine-readable rule representation
// ============================================================================
/**
 * RuleIR is the machine-readable representation linked to authoritative source
 * text. Free-form prose is NEVER the executable representation (§11).
 *
 * The compiled runtime representation is generated from RuleIR; rule evaluation
 * is deterministic (§10, I5) — LLMs are NOT authoritative.
 */
export interface Rule {
  id: string;
  code: string;             // human code e.g. "ECOWAS-FM-ART3"
  title: string;
  jurisdictionId: string;
  authorityId: string;
  sourceId: string;
  type: RuleType;
  ruleIr: RuleIR;
  temporal: TemporalRange;
  packageId: string;
  truthLevel: TruthLevel;   // most rules are T0/T1; interpretations T2/T3
}

export interface RuleIR {
  id: string;
  ruleId: string;
  /** Boolean expression tree over facts. Rule fires iff conditions match AND no exception matches. */
  conditions: ConditionNode;
  /** If ANY exception matches, the rule does NOT apply. */
  exceptions: ConditionNode[];
  /** Rights / obligations / permissions / restrictions / fees / options / consequences granted or denied. */
  effects: RuleEffect[];
  /** Optional definitional clauses referenced by conditions. */
  definitions?: Record<string, Definition>;
  /** References to other source artefacts (sourceId list). */
  references?: string[];
  /** Interpretive status — distinguishes settled vs contested rules (§12). */
  interpretiveStatus?: 'SETTLED' | 'CONTESTED' | 'AMBIGUOUS';
}

/**
 * Pure-data boolean expression tree. The rule engine evaluates this
 * deterministically — no LLM in the loop (I5).
 */
export type ConditionNode =
  | {
      kind: 'leaf';
      fact: string;          // attribute name on a Fact
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists';
      value: unknown;
    }
  | { kind: 'and'; children: ConditionNode[] }
  | { kind: 'or'; children: ConditionNode[] }
  | { kind: 'not'; child: ConditionNode };

export type EffectKind =
  | 'RIGHT'
  | 'OBLIGATION'
  | 'PERMISSION'
  | 'RESTRICTION'
  | 'FEE'
  | 'OPTION'
  | 'CONSEQUENCE';

export interface RuleEffect {
  kind: EffectKind;
  code: string;
  label: string;
  detail?: string;
  amount?: { value: number; currency: string; basis?: string };
}

export interface Definition {
  term: string;
  meaning: string;
}

/**
 * Deterministic output of evaluating a single Rule (architecture §10, §11).
 *
 * The RuleEngine produces one of these per (rule, facts, asOf) tuple — the
 * same inputs always yield byte-identical output (I5, I13). The `calculation`
 * array is preserved end-to-end so ProvenanceBuilder can rebuild exactly how
 * the engine reached its conclusion (I6).
 */
export interface RuleEvaluationResult {
  ruleId: string;
  matched: boolean;
  skippedDueToException: boolean;
  firedEffects: RuleEffect[];
  truthLevel: TruthLevel;
  calculation: CalculationStep[];
}

// ============================================================================
// 5. State  (architecture §4) — first-class, inspectable, versionable, auditable
// ============================================================================
export interface StateSnapshot {
  situationId: string;
  subjectId: string;
  jurisdictionIds: string[];
  asOf: string;              // ISO date — the evaluate-as_of anchor (I7)
  computedAt: string;        // ISO timestamp
  applicableRules: Rule[];
  firedEffects: FiredEffect[];
  options: Option[];
  obligations: Obligation[];
  rights: Right[];
  permissions: Permission[];
  restrictions: Restriction[];
  truthLevel: TruthLevel;   // overall — the LOWEST truth level among fired effects
  provenance: Provenance[];
}

export interface FiredEffect {
  ruleId: string;
  effect: RuleEffect;
  truthLevel: TruthLevel;
}

export interface Option {
  id: string;
  code: string;
  label: string;
  detail?: string;
  preconditions?: ConditionNode;
  actionId?: string;
}

export interface Obligation {
  id: string;
  code: string;
  label: string;
  dueBy?: string;
  authorityId: string;
}

export interface Right {
  id: string;
  code: string;
  label: string;
}

export interface Permission {
  id: string;
  code: string;
  label: string;
}

export interface Restriction {
  id: string;
  code: string;
  label: string;
}

// ============================================================================
// 6. Situations & Procedures  (architecture §7, §8)
// ============================================================================
export interface SituationState {
  id: string;
  label: string;
  description?: string;
  isTerminal?: boolean;
}

export interface SituationTransition {
  from: string;
  to: string;
  event: string;
  requiredFacts?: string[];
  preconditions?: ConditionNode;
}

/**
 * A Situation is a state machine (architecture §7): border_crossing,
 * traffic_stop, hospital_admission, building_permit, import_shipment, etc.
 */
export interface Situation {
  id: string;
  code: string;
  label: string;
  description: string;
  packageId: string;
  entryConditions: ConditionNode;
  states: SituationState[];
  transitions: SituationTransition[];
  requiredFacts: string[];
  applicableDomains: string[];
  actors: string[];
  procedures: string[];
  possibleActions: string[];
  exitConditions: ConditionNode;
  exceptionPaths?: string[];
}

export interface ProcedureStep {
  id: string;
  code: string;
  label: string;
  description?: string;
  requiredDocuments?: string[];
  acceptedAlternatives?: string[];
  expectedOutputs?: string[];
  fees?: { label: string; amount: number; currency: string }[];
  timing?: string;
  nextStep?: string;
  exceptionPath?: string;
}

export interface Procedure {
  id: string;
  code: string;
  label: string;
  situationId: string;
  steps: ProcedureStep[];
}

// ============================================================================
// 7. Action Model  (architecture §28)
// ============================================================================
/**
 * Decision → Action → Preconditions → Execution → Result → Evidence → Updated State
 */
export interface Action {
  id: string;
  code: string;
  label: string;
  description?: string;
  kind:
    | 'FILE'
    | 'PAY'
    | 'NOTIFY'
    | 'NAVIGATE'
    | 'SUBMIT'
    | 'GENERATE_DOCUMENT'
    | 'REQUEST_INFO'
    | 'REPORT'
    | 'HANDOFF';
  preconditions?: ConditionNode;
  executionHint?: string;
  expectedResult?: string;
}

// ============================================================================
// 8. Packages  (architecture §18, §19)
// ============================================================================
export type PackageCategory = 'JURISDICTION' | 'DOMAIN' | 'SITUATION' | 'CAPABILITY';

export interface PackageManifest {
  packageId: string;
  name: string;
  version: string;
  category: PackageCategory;
  dependencies: { packageId: string; versionRange: string }[];
  supportedJurisdictions: string[];
  domains: string[];
  situations: string[];
  capabilities: string[];
  sources: string[];
  rules: string[];
  procedures: string[];
  actions: string[];
  schemas: string[];
  testFixtures: string[];
  verificationMetadata: {
    signedBy: string;
    signedAt: string;
    hash: string;
  };
  description: string;
}

// ============================================================================
// 9. Evidence Graph  (architecture §16)
// ============================================================================
/**
 * Document pipeline: INPUT → CLASSIFY → OCR/VISION → EXTRACT → NORMALIZE
 *                    → ENTITY RESOLUTION → FACTS → EVIDENCE GRAPH
 *
 * Document-extracted facts MUST retain provenance to source page/region.
 */
export interface Document {
  id: string;
  type: string;
  title: string;
  tenantId: string | null;
  pages?: number;
}

export interface Evidence {
  id: string;
  documentId?: string;
  page?: number;
  region?: string;
  extractedFactIds: string[];
  confidence: number;
}

// ============================================================================
// 10. Context  (architecture §23 — UNDERSTAND family)
// ============================================================================
export interface ContextRequest {
  subjectId: string;
  locationId?: string;
  asOf: string;              // ISO date — evaluate(as_of = DATE) (I7)
  situationId?: string;
  facts: Fact[];
  jurisdictionIds: string[];
  objective?: string;
  tenantId: string | null;    // null = GLOBAL (I9)
}

export interface ContextBundle {
  request: ContextRequest;
  resolvedJurisdictions: Jurisdiction[];
  resolvedAuthorities: Authority[];
  applicableRules: Rule[];
  evidence: Evidence[];
  sources: Source[];
}

// ============================================================================
// 11. Audit  (architecture §25, §35)
// ============================================================================
export interface AuditEvent {
  id: string;
  tenantId: string | null;
  actor: string;
  action: string;
  subjectId?: string;
  timestamp: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  payload: Record<string, unknown>;
}

// ============================================================================
// 12. Tenant  (architecture §24)
// ============================================================================
export interface Tenant {
  id: string;
  name: string;
  kind: 'INDIVIDUAL' | 'HOUSEHOLD' | 'SMALL_BUSINESS' | 'ENTERPRISE' | 'PROFESSIONAL_ORG' | 'GOVERNMENT' | 'EMBEDDED';
  createdAt: string;
}
