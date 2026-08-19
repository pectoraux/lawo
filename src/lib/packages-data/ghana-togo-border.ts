/**
 * Nomos — Ghana→Togo Border Domain Package  (architecture §6, §18, §19)
 * ====================================================================
 * The ONE canonical package for the Ghana→Togo land border crossing
 * vertical. A DOMAIN package that adds border-specific rules and actions
 * on top of the existing JURISDICTION packs (jur.ghana, jur.togo,
 * jur.ecowas, jur.afcfta) and the SITUATION pack
 * (pkg.situation.border-crossing).
 *
 * ROUTE CONSTRAINT (Task 1):
 *   Every rule in this package constrains originCountry=GH and
 *   destinationCountry=TG. This is pure RuleIR/package data — NOT
 *   application code. Togo→Ghana (originCountry=TG, destinationCountry=GH)
 *   does NOT satisfy these rules. A separate domain.togo-ghana-border
 *   package would cover the reverse direction.
 *
 * LEGAL CERTIFICATION (Task 2 + Task 4):
 *   Rules are classified by verification status:
 *     - MACHINE_VALID: RuleIR passes validation; the rule is syntactically
 *       well-formed and deterministic. This is the minimum for execution.
 *     - LEGALLY_VERIFIED: The rule's legal proposition has been verified
 *       against an authoritative source by a qualified reviewer. The
 *       rule may claim T0 only when LEGALLY_VERIFIED.
 *
 *   As of this version, rules that have NOT been independently verified
 *   against authoritative legal sources are downgraded:
 *     - truthLevel: T2 (established interpretation — not yet authoritative)
 *     - interpretiveStatus: 'CONTESTED' (the legal basis requires verification)
 *     - verificationStatus: 'MACHINE_VALID' (passes structural validation only)
 *
 *   A SourceProposition record is attached to each rule via the
 *   definitions field, documenting the exact legal proposition, the
 *   source, and the verification status.
 *
 * Manifest:
 *   packageId   = 'domain.ghana-togo-border'
 *   version     = '1.1.0'
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
// jur.ecowas@1.1.0 will correct the codes. See ADR-0022 (REVISED).
// ---------------------------------------------------------------------------
const ECOWAS_MEMBER_STATES: readonly string[] = [
  'GH', 'NG', 'TG', 'CI', 'SN', 'ML', 'BF', 'BJ', 'NE', 'GU',
  'SL', 'LR', 'CV', 'GM', 'MR',
];

// ---------------------------------------------------------------------------
// Route constraint (Task 1) — originCountry=GH AND destinationCountry=TG
// These are pure ConditionNode leaves, evaluated by the deterministic
// RuleEngine. NOT application code.
// ---------------------------------------------------------------------------
const conditionRouteGhanaToTogo: ConditionNode = {
  kind: 'and',
  children: [
    { kind: 'leaf', fact: 'originCountry', operator: 'eq', value: 'GH' },
    { kind: 'leaf', fact: 'destinationCountry', operator: 'eq', value: 'TG' },
  ],
};

// ---------------------------------------------------------------------------
// Common conditions
// ---------------------------------------------------------------------------
const conditionHasBiometricId: ConditionNode = {
  kind: 'leaf',
  fact: 'documentType',
  operator: 'eq',
  value: 'biometric_ecowas_id',
};

const conditionNationalityMember: ConditionNode = {
  kind: 'leaf',
  fact: 'nationality',
  operator: 'in',
  value: ECOWAS_MEMBER_STATES,
};

const conditionOfficialLandBorder: ConditionNode = {
  kind: 'leaf',
  fact: 'entryPointType',
  operator: 'eq',
  value: 'official_land_border',
};

const conditionHasPassport: ConditionNode = {
  kind: 'leaf',
  fact: 'documentType',
  operator: 'eq',
  value: 'passport',
};

const conditionVehicleRegisteredInEcowas: ConditionNode = {
  kind: 'leaf',
  fact: 'vehicleRegistrationCountry',
  operator: 'in',
  value: ECOWAS_MEMBER_STATES,
};

const conditionUsingPrivateVehicle: ConditionNode = {
  kind: 'leaf',
  fact: 'travelMode',
  operator: 'eq',
  value: 'private_vehicle',
};

// ---------------------------------------------------------------------------
// Source Proposition Records (Task 2)
// ---------------------------------------------------------------------------
// Each rule's RuleIR.definitions carries a SourceProposition record that
// documents the exact legal proposition, the source, and the verification
// status. This is NOT the full ADR-0018 observation system — it is the
// smallest primitive necessary to distinguish MACHINE_VALID from
// LEGALLY_VERIFIED (Task 4).
//
// Until a proposition is independently verified against an authoritative
// source by a qualified legal reviewer, the rule's verificationStatus is
// MACHINE_VALID and its truthLevel is downgraded to T2.
// ---------------------------------------------------------------------------

interface SourceProposition {
  source: string;
  article: string;
  proposition: string;
  jurisdiction: string;
  effectiveDate: string;
  evidenceLocation: string;
  verificationStatus: 'MACHINE_VALID' | 'LEGALLY_VERIFIED';
  verifiedBy?: string;
  verifiedAt?: string;
}

// Proposition: ECOWAS biometric identity card directive
const PROPOSITION_BIOMETRIC_ID: SourceProposition = {
  source: 'src.gt-border.biometric-ecowas-2014',
  article: 'ECOWAS Directive C/DIR.1/08/14, Article 2',
  proposition:
    'ECOWAS member states shall adopt a biometric identity card for their nationals, which may serve as a travel document within the ECOWAS region.',
  jurisdiction: 'jur.ecowas',
  effectiveDate: '2014-01-01',
  evidenceLocation: 'ECOWAS Directive C/DIR.1/08/14 — full text not independently verified against the official ECOWAS gazette. The citation and article reference are based on secondary sources.',
  verificationStatus: 'MACHINE_VALID',
  // verificationStatus: 'LEGALLY_VERIFIED' — requires independent review against
  // the authoritative ECOWAS directive text. Not yet completed.
};

// Proposition: Ghana-Togo bilateral vehicle registration protocol
const PROPOSITION_VEHICLE_REGISTRATION: SourceProposition = {
  source: 'src.gt-border.vehicle-registration',
  article: 'Bilateral Protocol, Article 3',
  proposition:
    'Private vehicles registered in an ECOWAS member state may use designated lanes at the Ghana-Togo border, subject to presentation of valid registration documents.',
  jurisdiction: 'jur.ghana',
  effectiveDate: '2010-06-15',
  evidenceLocation: 'Bilateral protocol text not independently verified. The existence of a formal bilateral protocol between Ghana and Togo on vehicle registration has not been confirmed against primary diplomatic records.',
  verificationStatus: 'MACHINE_VALID',
  // verificationStatus: 'LEGALLY_VERIFIED' — requires verification against the
  // official bilateral treaty text. Not yet completed.
};

// Proposition: Document requirement (passport or biometric ID)
const PROPOSITION_DOCUMENT_REQUIREMENT: SourceProposition = {
  source: 'src.gt-border.biometric-ecowas-2014',
  article: 'ECOWAS Directive C/DIR.1/08/14, Article 4',
  proposition:
    'Travelers crossing the Ghana-Togo border must present either a valid passport or a biometric ECOWAS-compatible national identity card.',
  jurisdiction: 'jur.ecowas',
  effectiveDate: '2014-01-01',
  evidenceLocation: 'The specific requirement for the Ghana-Togo border is an interpretation of the general ECOWAS travel document framework. The exact article and provision have not been independently verified against the directive text. The directive may not explicitly name the Ghana-Togo border.',
  verificationStatus: 'MACHINE_VALID',
  // verificationStatus: 'LEGALLY_VERIFIED' — requires verification that the
  // directive explicitly requires passport-or-biometric-ID at this border.
};

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_MANIFEST: PackageManifest = {
  packageId: 'domain.ghana-togo-border',
  name: 'Ghana→Togo Land Border Domain Pack',
  version: '1.1.0',
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
    signedAt: '2026-08-19T00:00:00.000Z',
    hash: 'sha256:domain.ghana-togo-border:1.1.0:route-and-verification',
  },
  description:
    'Ghana→Togo land border domain rules with route constraints (origin=GH, destination=TG). Rules are classified MACHINE_VALID pending legal verification (ADR-0023).',
};

// ---------------------------------------------------------------------------
// Authorities
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_AUTHORITIES: Authority[] = [
  {
    id: 'auth.gt-border.joint-commission',
    name: 'Ghana–Togo Joint Border Commission',
    jurisdictionId: 'jur.ghana',
    kind: 'CUSTOMS',
  },
];

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_SOURCES: Source[] = [
  {
    id: 'src.gt-border.biometric-ecowas-2014',
    title: 'ECOWAS Biometric Identity Card Directive (2014)',
    citation:
      'ECOWAS Directive C/DIR.1/08/14 on the Establishment of the ECOWAS Biometric Identity Card, adopted at Accra, 2014',
    authorityId: 'auth.ecowas.authority',
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
// RuleIRs — each includes the route constraint AND a SourceProposition
// ---------------------------------------------------------------------------

const RULEIR_GT_BORDER_BIOMETRIC_ID: RuleIR = {
  id: 'ruleir.gt-border.biometric-id',
  ruleId: 'rule.gt-border.biometric-id',
  conditions: {
    kind: 'and',
    children: [
      conditionRouteGhanaToTogo,
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
  interpretiveStatus: 'CONTESTED',
  definitions: {
    sourceProposition: {
      term: 'sourceProposition',
      meaning: JSON.stringify(PROPOSITION_BIOMETRIC_ID),
    },
  },
};

const RULEIR_GT_BORDER_VEHICLE_REGISTRATION: RuleIR = {
  id: 'ruleir.gt-border.vehicle-registration',
  ruleId: 'rule.gt-border.vehicle-registration',
  conditions: {
    kind: 'and',
    children: [
      conditionRouteGhanaToTogo,
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
  interpretiveStatus: 'CONTESTED',
  definitions: {
    sourceProposition: {
      term: 'sourceProposition',
      meaning: JSON.stringify(PROPOSITION_VEHICLE_REGISTRATION),
    },
  },
};

const RULEIR_GT_BORDER_DOCUMENT_REQUIREMENT: RuleIR = {
  id: 'ruleir.gt-border.document-requirement',
  ruleId: 'rule.gt-border.document-requirement',
  conditions: {
    kind: 'and',
    children: [
      conditionRouteGhanaToTogo,
      {
        kind: 'or',
        children: [conditionHasPassport, conditionHasBiometricId],
      },
    ],
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
  interpretiveStatus: 'CONTESTED',
  definitions: {
    sourceProposition: {
      term: 'sourceProposition',
      meaning: JSON.stringify(PROPOSITION_DOCUMENT_REQUIREMENT),
    },
  },
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
// Task 4: Rules that are MACHINE_VALID but NOT LEGALLY_VERIFIED are
// downgraded from T0 to T2 (established interpretation, not authoritative).
// The interpretiveStatus is CONTESTED (the legal basis requires verification).
// A rule may claim T0 only when verificationStatus === 'LEGALLY_VERIFIED'.
// ---------------------------------------------------------------------------
export const GHANA_TOGO_BORDER_RULES: Rule[] = [
  {
    id: 'rule.gt-border.biometric-id',
    code: 'GT-BORDER-BIOMETRIC-ID',
    title:
      'Ghana→Togo border: ECOWAS nationals with a biometric ECOWAS-compatible national ID may use the expedited biometric lane at official land borders',
    jurisdictionId: 'jur.ecowas',
    authorityId: 'auth.ecowas.authority',
    sourceId: 'src.gt-border.biometric-ecowas-2014',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_GT_BORDER_BIOMETRIC_ID,
    temporal: {
      validFrom: '2014-01-01',
      validTo: null,
      publishedAt: '2014-01-01',
      ingestedAt: '2025-01-01',
      version: 2,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T2',
  },
  {
    id: 'rule.gt-border.vehicle-registration',
    code: 'GT-BORDER-VEHICLE-REG',
    title:
      'Ghana→Togo border: private vehicles registered in an ECOWAS member state may use the designated private vehicle lane',
    jurisdictionId: 'jur.ghana',
    authorityId: 'auth.gt-border.joint-commission',
    sourceId: 'src.gt-border.vehicle-registration',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_GT_BORDER_VEHICLE_REGISTRATION,
    temporal: {
      validFrom: '2010-06-15',
      validTo: null,
      publishedAt: '2010-06-15',
      ingestedAt: '2025-01-01',
      version: 2,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T2',
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
      version: 2,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'domain.ghana-togo-border',
    truthLevel: 'T2',
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
        conditionRouteGhanaToTogo,
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
        conditionRouteGhanaToTogo,
        conditionUsingPrivateVehicle,
        conditionVehicleRegisteredInEcowas,
      ],
    },
    expectedResult: 'Vehicle directed to the private vehicle lane.',
  },
];
