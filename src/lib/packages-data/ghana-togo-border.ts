/**
 * Nomos — Ghana→Togo Border Domain Package  (architecture §6, §18, §19)
 * ====================================================================
 * The ONE canonical package for the Ghana→Togo land border crossing
 * vertical. A DOMAIN package that adds border-specific rules and actions
 * on top of the existing JURISDICTION packs (jur.ghana, jur.togo,
 * jur.ecowas, jur.afcfta) and the SITUATION pack
 * (pkg.situation.border-crossing).
 *
 * This package does NOT redefine jurisdictions, authorities, or sources
 * owned by the dependency packs. It adds:
 *   - A biometric ECOWAS national-ID rule (expedited lane right)
 *   - A vehicle-registration rule (private vehicle lane permission)
 *   - A document-requirements rule (passport or biometric ID obligation)
 *   - Border-specific actions
 *
 * Manifest:
 *   packageId   = 'domain.ghana-togo-border'
 *   version     = '1.0.0'
 *   category    = 'DOMAIN'
 *   dependencies = [
 *     { packageId: 'jur.ghana',  versionRange: '^1.0.0' },
 *     { packageId: 'jur.togo',   versionRange: '^1.0.0' },
 *     { packageId: 'jur.ecowas', versionRange: '^1.0.0' },
 *     { packageId: 'jur.afcfta', versionRange: '^1.0.0' },
 *     { packageId: 'pkg.situation.border-crossing', versionRange: '^1.0.0' },
 *   ]
 *
 * Domain packs MUST NOT mutate kernel semantics (per I11). The rules here
 * are pure data composed over the generic Rule / RuleIR / ConditionNode
 * primitives. No LLM is in the evaluation loop (per I5).
 */
import type {
  Action,
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
// ECOWAS member states (ISO 3166-1 alpha-2) — mirrors the list in
// jur.ecowas@1.0.0. Used by the vehicle-registration rule.
// NOTE: jur.ecowas@1.0.0 contains a data discrepancy ('GU' for Guinea
// instead of 'GN'; Guinea-Bissau 'GW' is absent). This package mirrors
// the 1.0.0 list for consistency with historical evaluation. A future
// jur.ecowas@1.1.0 will correct the codes. See ADR-0022 (PROPOSED).
// ---------------------------------------------------------------------------
const ECOWAS_MEMBER_STATES: readonly string[] = [
  'GH', 'NG', 'TG', 'CI', 'SN', 'ML', 'BF', 'BJ', 'NE', 'GU',
  'SL', 'LR', 'CV', 'GM', 'MR',
];

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_MANIFEST: PackageManifest = {
  packageId: 'domain.ghana-togo-border',
  name: 'Ghana→Togo Land Border Domain Pack',
  version: '1.0.0',
  category: 'DOMAIN',
  dependencies: [
    { packageId: 'jur.ghana', versionRange: '^1.0.0' },
    { packageId: 'jur.togo', versionRange: '^1.0.0' },
    { packageId: 'jur.ecowas', versionRange: '^1.0.0' },
    { packageId: 'jur.afcfta', versionRange: '^1.0.0' },
    { packageId: 'pkg.situation.border-crossing', versionRange: '^1.0.0' },
  ],
  supportedJurisdictions: [],
  domains: ['ghana-togo-border'],
  situations: [],
  capabilities: [],
  sources: ['src.gt-border.biometric-ecowas-2014', 'src.gt-border.vehicle-registration'],
  rules: [
    'rule.gt-border.biometric-id',
    'rule.gt-border.vehicle-registration',
    'rule.gt-border.document-requirement',
  ],
  procedures: [],
  actions: ['act.gt-border.use-biometric-lane', 'act.gt-border.use-vehicle-lane'],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:domain.ghana-togo-border:1.0.0:7777777777777777777777777777777777777777777777777777777777777777',
  },
  description:
    'Ghana→Togo land border domain rules: biometric ECOWAS national ID, vehicle registration, and document requirements. Depends on jur.ghana, jur.togo, jur.ecowas, jur.afcfta, and the border-crossing situation pack.',
};

// ---------------------------------------------------------------------------
// Authorities  (architecture §3)
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_AUTHORITIES: Authority[] = [
  {
    id: 'auth.gt-border.joint-commission',
    name: 'Ghana–Togo Joint Border Commission',
    jurisdictionId: 'jur.ghana', // bilateral authority hosted under Ghana
    kind: 'CUSTOMS',
  },
];

// ---------------------------------------------------------------------------
// Sources  (architecture §3, §11)
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_SOURCES: Source[] = [
  {
    id: 'src.gt-border.biometric-ecowas-2014',
    title: 'ECOWAS Biometric Identity Card Directive (2014)',
    citation:
      'ECOWAS Directive C/DIR.1/08/14 on the Establishment of the ECOWAS Biometric Identity Card, adopted at Accra, 2014',
    authorityId: 'auth.ecowas.authority', // cross-package reference to jur.ecowas
    publishedAt: '2014-01-01',
  },
  {
    id: 'src.gt-border.vehicle-registration',
    title: 'Ghana–Togo Bilateral Vehicle Registration Protocol',
    citation:
      'Protocol on Vehicle Registration and Cross-Border Movement between the Republic of Ghana and the Togolese Republic',
    authorityId: 'auth.gt-border.joint-commission',
    publishedAt: '2010-06-15',
  },
];

// ---------------------------------------------------------------------------
// Rule conditions (pure-data boolean expression trees — architecture §11)
// ---------------------------------------------------------------------------

// Condition: traveler has a biometric ECOWAS-compatible national ID
const conditionHasBiometricId: ConditionNode = {
  kind: 'leaf',
  fact: 'documentType',
  operator: 'eq',
  value: 'biometric_ecowas_id',
};

// Condition: traveler nationality is an ECOWAS member state
const conditionNationalityMember: ConditionNode = {
  kind: 'leaf',
  fact: 'nationality',
  operator: 'in',
  value: ECOWAS_MEMBER_STATES,
};

// Condition: entry point is an official land border
const conditionOfficialLandBorder: ConditionNode = {
  kind: 'leaf',
  fact: 'entryPointType',
  operator: 'eq',
  value: 'official_land_border',
};

// Condition: traveler has a passport
const conditionHasPassport: ConditionNode = {
  kind: 'leaf',
  fact: 'documentType',
  operator: 'eq',
  value: 'passport',
};

// Condition: private vehicle is registered in an ECOWAS member state
const conditionVehicleRegisteredInEcowas: ConditionNode = {
  kind: 'leaf',
  fact: 'vehicleRegistrationCountry',
  operator: 'in',
  value: ECOWAS_MEMBER_STATES,
};

// Condition: traveler is using a private vehicle
const conditionUsingPrivateVehicle: ConditionNode = {
  kind: 'leaf',
  fact: 'travelMode',
  operator: 'eq',
  value: 'private_vehicle',
};

// ---------------------------------------------------------------------------
// RuleIRs
// ---------------------------------------------------------------------------

const RULEIR_GT_BORDER_BIOMETRIC_ID: RuleIR = {
  id: 'ruleir.gt-border.biometric-id',
  ruleId: 'rule.gt-border.biometric-id',
  conditions: {
    kind: 'and',
    children: [
      conditionNationalityMember,
      conditionHasBiometricId,
      conditionOfficialLandBorder,
    ],
  },
  exceptions: [],
  effects: [
    {
      kind: 'RIGHT',
      code: 'RIGHT_BIOMETRIC_EXPEDITED_LANE',
      label: 'Right to use the biometric expedited lane',
      detail:
        'ECOWAS nationals presenting a biometric ECOWAS-compatible national ID at an official land border may use the expedited biometric lane.',
    },
  ],
  references: ['src.gt-border.biometric-ecowas-2014'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_GT_BORDER_VEHICLE_REGISTRATION: RuleIR = {
  id: 'ruleir.gt-border.vehicle-registration',
  ruleId: 'rule.gt-border.vehicle-registration',
  conditions: {
    kind: 'and',
    children: [
      conditionUsingPrivateVehicle,
      conditionVehicleRegisteredInEcowas,
    ],
  },
  exceptions: [],
  effects: [
    {
      kind: 'PERMISSION',
      code: 'PERMISSION_PRIVATE_VEHICLE_LANE',
      label: 'Permitted to use the private vehicle lane',
      detail:
        'Private vehicles registered in an ECOWAS member state may use the designated private vehicle lane at the Ghana–Togo border.',
    },
  ],
  references: ['src.gt-border.vehicle-registration'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_GT_BORDER_DOCUMENT_REQUIREMENT: RuleIR = {
  id: 'ruleir.gt-border.document-requirement',
  ruleId: 'rule.gt-border.document-requirement',
  conditions: {
    kind: 'or',
    children: [conditionHasPassport, conditionHasBiometricId],
  },
  exceptions: [],
  effects: [
    {
      kind: 'PERMISSION',
      code: 'PERMISSION_DOCUMENT_SATISFIED',
      label: 'Travel document requirement satisfied',
      detail:
        'Travelers must present either a valid passport or a biometric ECOWAS-compatible national ID to cross the Ghana–Togo border.',
    },
  ],
  references: ['src.gt-border.biometric-ecowas-2014'],
  interpretiveStatus: 'SETTLED',
};

// ---------------------------------------------------------------------------
// Rules  (architecture §11 — RuleIR; §12 — DETERMINISTIC rule type; §13 — T0)
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_RULES: Rule[] = [
  {
    id: 'rule.gt-border.biometric-id',
    code: 'GT-BORDER-BIOMETRIC-ID',
    title:
      'Ghana→Togo border: ECOWAS nationals with a biometric ECOWAS-compatible national ID may use the expedited biometric lane at official land borders',
    jurisdictionId: 'jur.ecowas', // the biometric ID rule is scoped to ECOWAS
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.gt-border.biometric-ecowas-2014',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_GT_BORDER_BIOMETRIC_ID,
    temporal: {
      validFrom: '2014-01-01',
      validTo: null,
      publishedAt: '2014-01-01',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T0',
  },
  {
    id: 'rule.gt-border.vehicle-registration',
    code: 'GT-BORDER-VEHICLE-REG',
    title:
      'Ghana→Togo border: private vehicles registered in an ECOWAS member state may use the designated private vehicle lane',
    jurisdictionId: 'jur.ghana', // bilateral protocol hosted under Ghana
    authorityId: 'auth.gt-border.joint-commission',
    sourceId: 'src.gt-border.vehicle-registration',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_GT_BORDER_VEHICLE_REGISTRATION,
    temporal: {
      validFrom: '2010-06-15',
      validTo: null,
      publishedAt: '2010-06-15',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T0',
  },
  {
    id: 'rule.gt-border.document-requirement',
    code: 'GT-BORDER-DOC-REQ',
    title:
      'Ghana→Togo border: travelers must present a passport or biometric ECOWAS national ID to cross',
    jurisdictionId: 'jur.ecowas',
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.gt-border.biometric-ecowas-2014',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_GT_BORDER_DOCUMENT_REQUIREMENT,
    temporal: {
      validFrom: '2014-01-01',
      validTo: null,
      publishedAt: '2014-01-01',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T0',
  },
];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_ACTIONS: Action[] = [
  {
    id: 'act.gt-border.use-biometric-lane',
    code: 'GT-BORDER-USE-BIOMETRIC-LANE',
    label: 'Proceed to the biometric expedited lane',
    description:
      'Navigate to the biometric expedited lane for ECOWAS nationals with a biometric ID.',
    kind: 'NAVIGATE',
    preconditions: {
      kind: 'and',
      children: [
        conditionHasBiometricId,
        conditionNationalityMember,
        conditionOfficialLandBorder,
      ],
    },
    expectedResult: 'Traveler directed to the biometric expedited lane.',
  },
  {
    id: 'act.gt-border.use-vehicle-lane',
    code: 'GT-BORDER-USE-VEHICLE-LANE',
    label: 'Proceed to the private vehicle lane',
    description:
      'Navigate to the private vehicle lane for vehicles registered in an ECOWAS member state.',
    kind: 'NAVIGATE',
    preconditions: {
      kind: 'and',
      children: [
        conditionUsingPrivateVehicle,
        conditionVehicleRegisteredInEcowas,
      ],
    },
    expectedResult: 'Vehicle directed to the private vehicle lane.',
  },
];
