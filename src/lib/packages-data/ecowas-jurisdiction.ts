/**
 * Nomos — ECOWAS Supranational Jurisdiction Package  (architecture §5, §18, §19)
 * --------------------------------------------------------------------------------
 * A SUPRANATIONAL JURISDICTION package representing the Economic Community of
 * West African States (ECOWAS) and the 1979 Protocol on Free Movement of
 * Persons, Residence and Establishment. ECOWAS was founded on 1975-05-28 by
 * the Treaty of Lagos.
 *
 * Manifest:
 *   packageId             = 'jur.ecowas'
 *   version               = '1.0.0'
 *   category              = 'JURISDICTION'
 *   dependencies          = [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }]
 *   supportedJurisdictions = ['jur.ecowas']
 *
 * This package owns the cross-jurisdiction lineage edges that connect the
 * member-state jurisdiction packages (jur.ghana, jur.togo) to jur.ecowas via
 * DERIVES_FROM. Those edges reference jurisdictions defined in other packages;
 * the JurisdictionGraph assembles them globally via the package loader.
 *
 * All rules below are DETERMINISTIC, truthLevel T0 — they fire based purely
 * on facts and an explicit ConditionNode boolean tree. Per I5, no LLM is in
 * the loop for rule evaluation.
 */
import type {
  Authority,
  ConditionNode,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Rule,
  RuleIR,
  Source,
} from '@/kernel/primitives/types';

// ---------------------------------------------------------------------------
// ECOWAS member states (ISO 3166-1 alpha-2 codes) — the 15 current members.
// Used by the free-movement rules to scope the right of visa-free entry.
// ---------------------------------------------------------------------------
const ECOWAS_MEMBER_STATES: readonly string[] = [
  'GH', 'NG', 'TG', 'CI', 'SN', 'ML', 'BF', 'BJ', 'NE', 'GU',
  'SL', 'LR', 'CV', 'GM', 'MR',
];

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const ECOWAS_MANIFEST: PackageManifest = {
  packageId: 'jur.ecowas',
  name: 'ECOWAS Supranational Jurisdiction',
  version: '1.0.0',
  category: 'JURISDICTION',
  dependencies: [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }],
  supportedJurisdictions: ['jur.ecowas'],
  domains: [],
  situations: [],
  capabilities: [],
  sources: ['src.ecowas.fm-1979'],
  rules: ['rule.ecowas.fm.art3', 'rule.ecowas.fm.art4', 'rule.ecowas.fm.residence'],
  procedures: [],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:jur.ecowas:1.0.0:3333333333333333333333333333333333333333333333333333333333333333',
  },
  description:
    'ECOWAS supranational jurisdiction + 1979 Protocol on Free Movement of Persons, Residence and Establishment. Defines three DETERMINISTIC T0 free-movement rules scoped to ECOWAS member-state nationals.',
};

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------
export const ECOWAS_JURISDICTIONS: Jurisdiction[] = [
  {
    id: 'jur.ecowas',
    code: 'ECOWAS',
    name: 'Economic Community of West African States',
    kind: 'SUPRANATIONAL',
    parentIds: [],
    temporal: {
      validFrom: '1975-05-28',
      validTo: null,
      publishedAt: '1975-05-28',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
  {
    id: 'jur.ecowas.fm-protocol',
    code: 'ECOWAS-FM',
    name: 'ECOWAS Protocol on Free Movement of Persons, Residence and Establishment',
    kind: 'SUPRANATIONAL',
    parentIds: ['jur.ecowas'],
    temporal: {
      validFrom: '1979-05-29',
      validTo: null,
      publishedAt: '1979-05-29',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
];

// ---------------------------------------------------------------------------
// Jurisdiction edges
// ---------------------------------------------------------------------------
// Cross-package lineage edges. jur.ghana and jur.togo are declared in their
// own packages; the ECOWAS package owns the DERIVES_FROM edges that connect
// them to the ECOWAS supranational regime. The package loader flattens all
// edges into the global JurisdictionGraph.
export const ECOWAS_JURISDICTION_EDGES: JurisdictionEdge[] = [
  { fromId: 'jur.ghana', toId: 'jur.ecowas', relation: 'DERIVES_FROM' },
  { fromId: 'jur.togo', toId: 'jur.ecowas', relation: 'DERIVES_FROM' },
  { fromId: 'jur.ecowas.fm-protocol', toId: 'jur.ecowas', relation: 'APPLIES_TO' },
];

// ---------------------------------------------------------------------------
// Authorities  (architecture §3)
// ---------------------------------------------------------------------------
export const ECOWAS_AUTHORITIES: Authority[] = [
  {
    id: 'auth.ecowas.authority',
    name: 'Authority of ECOWAS Heads of State and Government',
    jurisdictionId: 'jur.ecowas',
    kind: 'INTERNATIONAL_BODY',
  },
];

// ---------------------------------------------------------------------------
// Sources  (architecture §3, §11)
// ---------------------------------------------------------------------------
export const ECOWAS_SOURCES: Source[] = [
  {
    id: 'src.ecowas.fm-1979',
    title: 'ECOWAS Protocol A/P.1/5/79 on Free Movement of Persons, Residence and Establishment',
    citation:
      'Protocol A/P.1/5/79 on Free Movement of Persons, Residence and Establishment, adopted at Dakar on 29 May 1979 under the ECOWAS Treaty (Lagos, 28 May 1975)',
    url: 'https://archive.ecowas.int/protocols/AP15979',
    authorityId: 'auth.ecowas.authority',
    publishedAt: '1979-05-29',
  },
];

// ---------------------------------------------------------------------------
// Rule conditions (pure-data boolean expression trees — architecture §11)
// ---------------------------------------------------------------------------
const conditionNationalityMember: ConditionNode = {
  kind: 'leaf',
  fact: 'nationality',
  operator: 'in',
  value: ECOWAS_MEMBER_STATES,
};

const conditionPublicSecurityRisk: ConditionNode = {
  kind: 'leaf',
  fact: 'hasPublicSecurityRisk',
  operator: 'eq',
  value: true,
};

const conditionIntendedStayLte90: ConditionNode = {
  kind: 'leaf',
  fact: 'intendedStayDays',
  operator: 'lte',
  value: 90,
};

// ---------------------------------------------------------------------------
// RuleIRs
// ---------------------------------------------------------------------------
const RULEIR_ECOWAS_FM_ART3: RuleIR = {
  id: 'ruleir.ecowas.fm.art3',
  ruleId: 'rule.ecowas.fm.art3',
  conditions: conditionNationalityMember,
  exceptions: [],
  effects: [
    {
      kind: 'RIGHT',
      code: 'RIGHT_FREE_ENTRY',
      label: 'Right of entry without visa',
      detail: 'ECOWAS citizens may enter member states without a visa.',
    },
    {
      kind: 'PERMISSION',
      code: 'PERMISSION_TRANSIT_90DAYS',
      label: 'Permitted to transit/stay up to 90 days',
      detail: 'Initial 90-day stay right granted on entry, renewable under the Protocol.',
    },
  ],
  references: ['src.ecowas.fm-1979'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_ECOWAS_FM_ART4: RuleIR = {
  id: 'ruleir.ecowas.fm.art4',
  ruleId: 'rule.ecowas.fm.art4',
  conditions: {
    kind: 'and',
    children: [conditionNationalityMember, conditionPublicSecurityRisk],
  },
  exceptions: [],
  effects: [
    {
      kind: 'RESTRICTION',
      code: 'RESTRICTION_ENTRY_REFUSED',
      label: 'Entry may be refused on public policy/security/health grounds',
      detail: 'Member State may refuse entry on public policy, public security, or public health grounds.',
    },
  ],
  references: ['src.ecowas.fm-1979'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_ECOWAS_FM_RESIDENCE: RuleIR = {
  id: 'ruleir.ecowas.fm.residence',
  ruleId: 'rule.ecowas.fm.residence',
  conditions: {
    kind: 'and',
    children: [conditionNationalityMember, conditionIntendedStayLte90],
  },
  exceptions: [],
  effects: [
    {
      kind: 'RIGHT',
      code: 'RIGHT_RESIDENCE_TEMPORARY',
      label: 'Temporary residence right (≤90 days)',
      detail: 'Residence right for stays up to 90 days, per Article 5 of the Protocol.',
    },
  ],
  references: ['src.ecowas.fm-1979'],
  interpretiveStatus: 'SETTLED',
};

// ---------------------------------------------------------------------------
// Rules  (architecture §11 — RuleIR; §12 — DETERMINISTIC rule type; §13 — T0)
// ---------------------------------------------------------------------------
export const ECOWAS_RULES: Rule[] = [
  {
    id: 'rule.ecowas.fm.art3',
    code: 'ECOWAS-FM-ART3',
    title: 'ECOWAS Free Movement Article 3: Right of Entry without Visa for Citizens of Member States',
    jurisdictionId: 'jur.ecowas',
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.ecowas.fm-1979',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_ECOWAS_FM_ART3,
    temporal: {
      validFrom: '1979-05-29',
      validTo: null,
      publishedAt: '1979-05-29',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.ecowas',
    truthLevel: 'T0',
  },
  {
    id: 'rule.ecowas.fm.art4',
    code: 'ECOWAS-FM-ART4',
    title: 'ECOWAS Free Movement Article 4: Member State may refuse entry on public policy, public security, or public health grounds',
    jurisdictionId: 'jur.ecowas',
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.ecowas.fm-1979',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_ECOWAS_FM_ART4,
    temporal: {
      validFrom: '1979-05-29',
      validTo: null,
      publishedAt: '1979-05-29',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.ecowas',
    truthLevel: 'T0',
  },
  {
    id: 'rule.ecowas.fm.residence',
    code: 'ECOWAS-FM-ART5',
    title: 'ECOWAS Free Movement Article 5: Residence rights',
    jurisdictionId: 'jur.ecowas',
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.ecowas.fm-1979',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_ECOWAS_FM_RESIDENCE,
    temporal: {
      validFrom: '1979-05-29',
      validTo: null,
      publishedAt: '1979-05-29',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.ecowas',
    truthLevel: 'T0',
  },
];
