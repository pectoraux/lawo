/**
 * Nomos — AfCFTA Supranational Jurisdiction Package  (architecture §5, §18, §19)
 * ----------------------------------------------------------------------------------
 * A SUPRANATIONAL JURISDICTION package representing the African Continental Free
 * Trade Area (AfCFTA). The Agreement Establishing the AfCFTA was signed on
 * 21 March 2018 in Kigali and entered into force on 30 May 2019. The AfCFTA
 * Secretariat is headquartered in Accra, Ghana.
 *
 * Manifest:
 *   packageId             = 'jur.afcfta'
 *   version               = '1.0.0'
 *   category              = 'JURISDICTION'
 *   dependencies          = [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }]
 *   supportedJurisdictions = ['jur.afcfta']
 *
 * This package owns the DERIVES_FROM edges connecting ECOWAS, Ghana, and Togo
 * to the AfCFTA supranational regime. The edges reference jurisdictions that
 * are declared in other packages; the package loader flattens them globally.
 *
 * All rules below are DETERMINISTIC, truthLevel T0 — they fire based purely
 * on facts and an explicit ConditionNode boolean tree (per I5).
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
// Manifest
// ---------------------------------------------------------------------------
export const AFCFTA_MANIFEST: PackageManifest = {
  packageId: 'jur.afcfta',
  name: 'AfCFTA Supranational Jurisdiction',
  version: '1.0.0',
  category: 'JURISDICTION',
  dependencies: [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }],
  supportedJurisdictions: ['jur.afcfta'],
  domains: [],
  situations: [],
  capabilities: [],
  sources: ['src.afcfta.agreement-2018'],
  rules: [
    'rule.afcfta.deminimis.personal',
    'rule.afcfta.duty.commercial',
    'rule.afcfta.prohibited.goods',
  ],
  procedures: [],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:jur.afcfta:1.0.0:4444444444444444444444444444444444444444444444444444444444444444',
  },
  description:
    'AfCFTA supranational jurisdiction + Agreement Establishing the African Continental Free Trade Area. Defines three DETERMINISTIC T0 customs/trade rules covering the de minimis exemption, commercial duty obligation, and prohibition of restricted goods.',
};

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------
export const AFCFTA_JURISDICTIONS: Jurisdiction[] = [
  {
    id: 'jur.afcfta',
    code: 'AFCFTA',
    name: 'African Continental Free Trade Area',
    kind: 'SUPRANATIONAL',
    parentIds: [],
    temporal: {
      validFrom: '2019-05-30',
      validTo: null,
      publishedAt: '2018-03-21',
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
// Cross-package lineage edges. ECOWAS coordinates under AfCFTA; Ghana and
// Togo derive from AfCFTA directly. The edges reference jurisdictions declared
// in other packages; the package loader flattens them globally.
export const AFCFTA_JURISDICTION_EDGES: JurisdictionEdge[] = [
  { fromId: 'jur.ecowas', toId: 'jur.afcfta', relation: 'DERIVES_FROM' },
  { fromId: 'jur.ghana', toId: 'jur.afcfta', relation: 'DERIVES_FROM' },
  { fromId: 'jur.togo', toId: 'jur.afcfta', relation: 'DERIVES_FROM' },
];

// ---------------------------------------------------------------------------
// Authorities  (architecture §3)
// ---------------------------------------------------------------------------
export const AFCFTA_AUTHORITIES: Authority[] = [
  {
    id: 'auth.afcfta.secretariat',
    name: 'AfCFTA Secretariat (Accra)',
    jurisdictionId: 'jur.afcfta',
    kind: 'INTERNATIONAL_BODY',
  },
];

// ---------------------------------------------------------------------------
// Sources  (architecture §3, §11)
// ---------------------------------------------------------------------------
export const AFCFTA_SOURCES: Source[] = [
  {
    id: 'src.afcfta.agreement-2018',
    title: 'Agreement Establishing the African Continental Free Trade Area',
    citation:
      'Agreement Establishing the African Continental Free Trade Area, signed at Kigali on 21 March 2018, entered into force on 30 May 2019',
    url: 'https://www.afcfta.au.int/',
    authorityId: 'auth.afcfta.secretariat',
    publishedAt: '2018-03-21',
  },
];

// ---------------------------------------------------------------------------
// Rule conditions (pure-data boolean expression trees — architecture §11)
// ---------------------------------------------------------------------------
const conditionGoodsValueLt500: ConditionNode = {
  kind: 'leaf',
  fact: 'goodsValueUsd',
  operator: 'lt',
  value: 500,
};

const conditionGoodsPurposePersonal: ConditionNode = {
  kind: 'leaf',
  fact: 'goodsPurpose',
  operator: 'eq',
  value: 'personal',
};

const conditionGoodsValueGte500: ConditionNode = {
  kind: 'leaf',
  fact: 'goodsValueUsd',
  operator: 'gte',
  value: 500,
};

const conditionGoodsPurposeCommercial: ConditionNode = {
  kind: 'leaf',
  fact: 'goodsPurpose',
  operator: 'eq',
  value: 'commercial',
};

const conditionHasProhibitedGoods: ConditionNode = {
  kind: 'leaf',
  fact: 'hasProhibitedGoods',
  operator: 'eq',
  value: true,
};

// ---------------------------------------------------------------------------
// RuleIRs
// ---------------------------------------------------------------------------
const RULEIR_AFCFTA_DEMINIMIS_PERSONAL: RuleIR = {
  id: 'ruleir.afcfta.deminimis.personal',
  ruleId: 'rule.afcfta.deminimis.personal',
  conditions: {
    kind: 'and',
    children: [conditionGoodsValueLt500, conditionGoodsPurposePersonal],
  },
  exceptions: [],
  effects: [
    {
      kind: 'RIGHT',
      code: 'RIGHT_DEMINIMIS_EXEMPT',
      label: 'Goods exempt from customs duty (de minimis)',
      detail: 'Personal effects of non-commercial value under USD 500 are exempt from customs duty for travellers.',
    },
  ],
  references: ['src.afcfta.agreement-2018'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_AFCFTA_DUTY_COMMERCIAL: RuleIR = {
  id: 'ruleir.afcfta.duty.commercial',
  ruleId: 'rule.afcfta.duty.commercial',
  conditions: {
    kind: 'and',
    children: [conditionGoodsValueGte500, conditionGoodsPurposeCommercial],
  },
  exceptions: [],
  effects: [
    {
      kind: 'OBLIGATION',
      code: 'OBLIGATION_DECLARE_GOODS',
      label: 'Declare commercial goods to customs',
      detail: 'Commercial goods valued at USD 500 or above must be declared to customs.',
    },
    {
      kind: 'FEE',
      code: 'FEE_CUSTOMS_DUTY',
      label: 'Customs duty payable',
      detail: 'Preferential tariff applies where AfCFTA rules of origin are met; otherwise Most-Favoured-Nation (MFN) tariff applies.',
      amount: {
        value: 0,
        currency: 'USD',
        basis: 'Preferential tariff where origin rules met; otherwise MFN',
      },
    },
  ],
  references: ['src.afcfta.agreement-2018'],
  interpretiveStatus: 'SETTLED',
};

const RULEIR_AFCFTA_PROHIBITED_GOODS: RuleIR = {
  id: 'ruleir.afcfta.prohibited.goods',
  ruleId: 'rule.afcfta.prohibited.goods',
  conditions: conditionHasProhibitedGoods,
  exceptions: [],
  effects: [
    {
      kind: 'RESTRICTION',
      code: 'RESTRICTION_PROHIBITED_GOODS',
      label: 'Prohibited goods may not cross the border',
      detail: 'Counterfeit goods, narcotics, weapons, and other prohibited / restricted items are barred from import/export.',
    },
  ],
  references: ['src.afcfta.agreement-2018'],
  interpretiveStatus: 'SETTLED',
};

// ---------------------------------------------------------------------------
// Rules  (architecture §11 — RuleIR; §12 — DETERMINISTIC rule type; §13 — T0)
// ---------------------------------------------------------------------------
// The rule itself carries authorityId 'auth.afcfta.secretariat' — this is the
// provenance anchor for the OBLIGATION effect produced by the commercial duty
// rule (the StateEngine derives the Obligation record's authorityId from the
// Rule, not from the RuleEffect — see types.ts).
export const AFCFTA_RULES: Rule[] = [
  {
    id: 'rule.afcfta.deminimis.personal',
    code: 'AFCFTA-DEMINIMIS-PERSONAL',
    title:
      'AfCFTA de minimis: personal effects of non-commercial value under USD 500 are exempt from customs duty for travellers',
    jurisdictionId: 'jur.afcfta',
    authorityId: 'auth.afcfta.secretariat',
    sourceId: 'src.afcfta.agreement-2018',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_AFCFTA_DEMINIMIS_PERSONAL,
    temporal: {
      validFrom: '2019-05-30',
      validTo: null,
      publishedAt: '2019-05-30',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.afcfta',
    truthLevel: 'T0',
  },
  {
    id: 'rule.afcfta.duty.commercial',
    code: 'AFCFTA-DUTY-COMMERCIAL',
    title:
      'AfCFTA commercial duty: commercial goods valued at USD 500 or above are subject to AfCFTA preferential tariff where origin rules are met; otherwise MFN applies',
    jurisdictionId: 'jur.afcfta',
    authorityId: 'auth.afcfta.secretariat',
    sourceId: 'src.afcfta.agreement-2018',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_AFCFTA_DUTY_COMMERCIAL,
    temporal: {
      validFrom: '2019-05-30',
      validTo: null,
      publishedAt: '2019-05-30',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.afcfta',
    truthLevel: 'T0',
  },
  {
    id: 'rule.afcfta.prohibited.goods',
    code: 'AFCFTA-PROHIBITED-GOODS',
    title:
      'AfCFTA prohibited and restricted goods: counterfeit, narcotics, weapons and similar goods are barred from import/export',
    jurisdictionId: 'jur.afcfta',
    authorityId: 'auth.afcfta.secretariat',
    sourceId: 'src.afcfta.agreement-2018',
    type: 'DETERMINISTIC',
    ruleIr: RULEIR_AFCFTA_PROHIBITED_GOODS,
    temporal: {
      validFrom: '2019-05-30',
      validTo: null,
      publishedAt: '2019-05-30',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'jur.afcfta',
    truthLevel: 'T0',
  },
];
